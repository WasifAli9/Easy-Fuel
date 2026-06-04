import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Banner,
  Card,
  Chip,
  Menu,
  Portal,
  Checkbox,
  ProgressBar,
  Text,
  TextInput,
} from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { openStoredDocument, putFileToUploadUrl, readUploadObjectPath } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { readableType } from "@/design/typography";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconMetaRow, SectionTitleRow } from "@/components/IconMetaRow";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";

type Vehicle = {
  id: string;
  registrationNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  capacityLitres?: number;
  fuelTypes?: string[];
  licenseDiskExpiry?: string;
  roadworthyExpiry?: string;
  insuranceExpiry?: string;
  complianceStatus?: string;
  companyId?: string | null;
};

type VehicleDocument = {
  id: string;
  doc_type: string;
  title?: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  verification_status?: "pending" | "pending_review" | "verified" | "approved" | "rejected" | string;
  created_at?: string;
};

type VehicleComplianceStatus = {
  status?: string;
  approvedDocuments?: number;
  totalDocuments?: number;
  missingDocuments?: string[];
  documents?: Array<{
    docType: string;
    title: string;
    required: boolean;
    status: string;
    uploadedAt?: string | null;
  }>;
};

type VehicleForm = {
  registration_number: string;
  make: string;
  model: string;
  year: string;
  capacity_litres: string;
  fuel_types: string;
  license_disk_expiry: string;
  roadworthy_expiry: string;
  insurance_expiry: string;
};

type CompanyMembership = {
  workIndependent: boolean;
  membershipStatus: "none" | "pending" | "approved" | "rejected";
  companyId: string | null;
  companyName: string | null;
  isDisabledByCompany: boolean;
  disabledReason: string | null;
  rejectionReason: string | null;
  canUseCompanyFleet: boolean;
  mode?: "independent" | "company";
};

type PublicCompany = {
  id: string;
  name: string;
  status?: string;
};

const requiredVehicleDocuments = [
  { docType: "vehicle_registration", title: "Vehicle Registration Certificate", required: true },
  { docType: "roadworthy_certificate", title: "Roadworthy Certificate", required: true },
  { docType: "insurance_certificate", title: "Insurance Certificate", required: true },
  { docType: "dg_vehicle_permit", title: "Dangerous Goods Vehicle Permit", required: false },
  { docType: "letter_of_authority", title: "Letter of Authority", required: false },
];

const emptyForm: VehicleForm = {
  registration_number: "",
  make: "",
  model: "",
  year: "",
  capacity_litres: "",
  fuel_types: "",
  license_disk_expiry: "",
  roadworthy_expiry: "",
  insurance_expiry: "",
};

export function DriverVehiclesScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const scrollBottomPad = Math.max(insets.bottom, 12) + 72;
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [workIndependent, setWorkIndependent] = useState(true);
  const [joinFleet, setJoinFleet] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyMenuVisible, setCompanyMenuVisible] = useState(false);
  const queryClient = useQueryClient();

  const membershipQuery = useQuery({
    queryKey: ["/api/driver/company-membership"],
    queryFn: async () => (await apiClient.get<CompanyMembership>("/api/driver/company-membership")).data,
    refetchInterval: 10_000,
  });

  const companiesQuery = useQuery({
    queryKey: ["/api/companies/public-list"],
    enabled: joinFleet,
    queryFn: async () => (await apiClient.get<PublicCompany[]>("/api/companies/public-list")).data ?? [],
  });

  const linkedToCompany = useMemo(() => {
    const m = membershipQuery.data;
    return !!m?.canUseCompanyFleet && !m?.isDisabledByCompany;
  }, [membershipQuery.data]);

  const activeVehicleQuery = useQuery({
    queryKey: ["/api/driver/active-vehicle"],
    queryFn: async () =>
      (await apiClient.get<{ vehicleId: string | null; vehicle: Vehicle | null }>("/api/driver/active-vehicle")).data,
    refetchInterval: 10_000,
  });

  const availablePoolQuery = useQuery({
    queryKey: ["/api/driver/company-fleet/available-vehicles"],
    enabled: linkedToCompany,
    queryFn: async () => (await apiClient.get<Vehicle[]>("/api/driver/company-fleet/available-vehicles")).data ?? [],
  });

  const claimCompanyVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiClient.post(`/api/driver/vehicles/${vehicleId}/claim-company-vehicle`, {});
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/company-fleet/available-vehicles"] }),
      ]);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Could not select vehicle", msg || "Try again or contact your fleet manager.");
    },
  });

  const releaseCompanyVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiClient.post(`/api/driver/vehicles/${vehicleId}/release-company-vehicle`, {});
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/company-fleet/available-vehicles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/active-vehicle"] }),
      ]);
      Alert.alert("Released to fleet", "This company vehicle is back in the pool for other drivers.");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Could not release vehicle", msg || "Try again or contact your fleet manager.");
    },
  });

  const confirmReleaseCompanyVehicle = (vehicle: Vehicle) => {
    const label = vehicle.registrationNumber || "this company vehicle";
    Alert.alert(
      "Release to fleet pool?",
      `Return ${label} to your fleet company pool? You can claim it again later from Available company vehicles.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: () => releaseCompanyVehicleMutation.mutate(vehicle.id),
        },
      ],
    );
  };

  useEffect(() => {
    if (!membershipQuery.data) return;
    const m = membershipQuery.data;
    setWorkIndependent(m.workIndependent ?? true);
    setJoinFleet(
      m.membershipStatus === "pending" || m.membershipStatus === "approved" || !!m.companyId,
    );
    setSelectedCompanyId(m.companyId || "");
  }, [membershipQuery.data]);

  const invalidateFleetQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/driver/company-membership"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/driver/company-fleet/available-vehicles"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/driver/active-vehicle"] }),
    ]);
  };

  const preferencesMutation = useMutation({
    mutationFn: async (value: boolean) => {
      await apiClient.put("/api/driver/company-membership/preferences", { workIndependent: value });
    },
    onSuccess: invalidateFleetQueries,
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Error", msg || "Could not save preferences.");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a fleet company.");
      await apiClient.post("/api/driver/company-membership/apply", { companyId: selectedCompanyId });
    },
    onSuccess: async () => {
      await invalidateFleetQueries();
      Alert.alert("Application sent", "The company will review your request.");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Error", msg || "Could not apply.");
    },
  });

  const cancelApplyMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete("/api/driver/company-membership/apply");
    },
    onSuccess: async () => {
      await invalidateFleetQueries();
      Alert.alert("Cancelled", "Application withdrawn.");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Error", msg || "Could not cancel.");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/api/driver/company-membership/leave");
    },
    onSuccess: async () => {
      setJoinFleet(false);
      await invalidateFleetQueries();
      Alert.alert("Left company", "Company vehicles have been released.");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Error", msg || "Could not leave company.");
    },
  });

  const setActiveVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiClient.put("/api/driver/active-vehicle", { vehicleId });
    },
    onSuccess: invalidateFleetQueries,
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message;
      Alert.alert("Error", msg || "Could not set active vehicle.");
    },
  });

  const selectedCompanyLabel = useMemo(() => {
    if (!selectedCompanyId) return "Select a company";
    const fromList = (companiesQuery.data ?? []).find((c) => c.id === selectedCompanyId);
    if (fromList?.name) return fromList.name;
    if (membershipQuery.data?.companyId === selectedCompanyId && membershipQuery.data?.companyName) {
      return membershipQuery.data.companyName;
    }
    return "Select a company";
  }, [selectedCompanyId, companiesQuery.data, membershipQuery.data]);

  const vehiclesQuery = useQuery({
    queryKey: ["/api/driver/vehicles"],
    queryFn: async () => (await apiClient.get<Vehicle[]>("/api/driver/vehicles")).data,
    staleTime: 30_000,
    refetchInterval: 10_000,
  });

  const addVehicleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        registration_number: form.registration_number.trim(),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? Number(form.year) : null,
        capacity_litres: form.capacity_litres ? Number(form.capacity_litres) : null,
        fuel_types: form.fuel_types
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        license_disk_expiry: form.license_disk_expiry || null,
        roadworthy_expiry: form.roadworthy_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
      };
      await apiClient.post("/api/driver/vehicles", payload);
    },
    onSuccess: async () => {
      setShowAdd(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
    },
  });

  const docsQuery = useQuery({
    queryKey: ["/api/driver/vehicles", selectedVehicle?.id, "documents"],
    enabled: !!selectedVehicle?.id,
    queryFn: async () =>
      (await apiClient.get<VehicleDocument[]>(`/api/driver/vehicles/${selectedVehicle?.id}/documents`)).data ?? [],
    refetchInterval: 5_000,
  });

  const complianceStatusQuery = useQuery({
    queryKey: ["/api/driver/vehicles", selectedVehicle?.id, "compliance/status"],
    enabled: !!selectedVehicle?.id,
    queryFn: async () =>
      (await apiClient.get<VehicleComplianceStatus>(`/api/driver/vehicles/${selectedVehicle?.id}/compliance/status`)).data,
    refetchInterval: 5_000,
  });

  const findDocument = (docType: string) =>
    (docsQuery.data ?? []).find((doc) => doc.doc_type === docType);

  const uploadVehicleDocument = async (docType: string, title: string) => {
    if (!selectedVehicle?.id) return;
    setUploadError(null);
    setUploadingDocType(docType);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const file = picked.assets[0];
      const uploadMeta = (await apiClient.post("/api/objects/upload")).data as { uploadURL: string };
      if (!uploadMeta?.uploadURL) {
        throw new Error("Could not get upload URL.");
      }

      const fileBlob = await (await fetch(file.uri)).blob();
      const uploadResponse = await putFileToUploadUrl(
        uploadMeta.uploadURL,
        fileBlob,
        file.mimeType || "application/octet-stream",
      );
      if (!uploadResponse.ok) {
        throw new Error("File upload failed.");
      }

      const storedRelativePath = await readUploadObjectPath(uploadResponse, uploadMeta.uploadURL);
      const aclResponse = await apiClient.put("/api/documents", {
        documentURL: storedRelativePath,
      });
      const objectPath =
        (aclResponse.data as { objectPath?: string }).objectPath || storedRelativePath;
      if (!objectPath) {
        throw new Error("Could not secure uploaded document.");
      }

      await apiClient.post("/api/driver/documents", {
        owner_type: "vehicle",
        owner_id: selectedVehicle.id,
        doc_type: docType,
        title,
        file_path: objectPath,
        file_size: file.size ?? null,
        mime_type: file.mimeType ?? null,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicle.id, "documents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicle.id, "compliance/status"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] }),
      ]);
    } catch (error) {
      setUploadError((error as Error).message || "Failed to upload document.");
    } finally {
      setUploadingDocType(null);
    }
  };

  const viewVehicleDocument = async (doc: VehicleDocument) => {
    if (!doc.file_path) return;
    try {
      await openStoredDocument(doc.file_path);
    } catch {
      setUploadError("Could not open document.");
    }
  };

  const openCompliance = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setUploadError(null);
  };

  useEffect(() => {
    if (!selectedVehicle?.id) return;
    queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicle.id, "documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicle.id, "compliance/status"] });
  }, [selectedVehicle?.id, queryClient]);

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const isCompanyVehicle = (v: Vehicle) =>
    !!(v.companyId ?? (v as Vehicle & { company_id?: string | null }).company_id);
  const assignedCompanyVehicles = useMemo(
    () => vehicles.filter(isCompanyVehicle),
    [vehicles],
  );
  const personalVehicles = useMemo(
    () => vehicles.filter((v) => !isCompanyVehicle(v)),
    [vehicles],
  );
  const activeVehicleId = activeVehicleQuery.data?.vehicleId ?? null;
  const membershipStatus = membershipQuery.data?.membershipStatus ?? "none";

  const addVehicleInputCommon = {
    mode: "outlined" as const,
    style: styles.addVehicleField,
    outlineColor: theme.colors.outline,
    activeOutlineColor: theme.colors.primary,
    textColor: theme.colors.onSurface,
    theme: { colors: { onSurfaceVariant: theme.colors.onSurfaceVariant } },
  };

  if (selectedVehicle) {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollFill}
          contentContainerStyle={[styles.complianceScrollContent, { paddingBottom: scrollBottomPad }]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Card mode="contained" style={styles.headerCard}>
            <Card.Content style={styles.complianceHeaderRow}>
              <View style={styles.complianceHeaderText}>
                <Text variant="headlineSmall">Vehicle Compliance</Text>
                <Text style={styles.subtitle}>{selectedVehicle.registrationNumber || "Selected vehicle"}</Text>
              </View>
              <Button onPress={() => setSelectedVehicle(null)}>Back</Button>
            </Card.Content>
          </Card>

          <Text style={styles.subtitle}>Upload and manage compliance documents.</Text>

          {uploadError ? (
            <Banner visible icon="alert-circle">
              {uploadError}
            </Banner>
          ) : null}

          {complianceStatusQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            <Card mode="outlined" style={styles.complianceSummary}>
              <Card.Content>
                <Text variant="titleSmall">
                  {(complianceStatusQuery.data?.approvedDocuments ?? 0)} /{" "}
                  {(complianceStatusQuery.data?.totalDocuments ?? requiredVehicleDocuments.length)} documents approved
                </Text>
                <ProgressBar
                  style={styles.progress}
                  progress={
                    (complianceStatusQuery.data?.totalDocuments ?? 0) > 0
                      ? (complianceStatusQuery.data?.approvedDocuments ?? 0) /
                        (complianceStatusQuery.data?.totalDocuments ?? 1)
                      : 0
                  }
                />
                {complianceStatusQuery.data?.missingDocuments?.length ? (
                  <Text style={styles.meta}>
                    Missing: {complianceStatusQuery.data.missingDocuments.join(", ")}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          )}

          {requiredVehicleDocuments.map((docDef) => {
            const uploaded = findDocument(docDef.docType);
            const complianceDoc = complianceStatusQuery.data?.documents?.find((d) => d.docType === docDef.docType);
            const status = complianceDoc?.status ?? uploaded?.verification_status ?? "pending";
            return (
              <Card key={docDef.docType} mode="outlined" style={styles.docCard}>
                <Card.Content>
                  <View style={styles.docTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall">{docDef.title}</Text>
                      <Text style={styles.meta}>{docDef.required ? "Required" : "Optional"}</Text>
                      {uploaded?.created_at ? (
                        <Text style={styles.meta}>
                          Uploaded: {new Date(uploaded.created_at).toLocaleDateString("en-ZA")}
                        </Text>
                      ) : null}
                    </View>
                    <Chip compact style={styles.statusChip}>
                      {status === "verified" || status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending"}
                    </Chip>
                  </View>
                  <View style={styles.docActions}>
                    <Button
                      mode="outlined"
                      disabled={!uploaded?.file_path}
                      onPress={() => uploaded && viewVehicleDocument(uploaded)}
                    >
                      View
                    </Button>
                    <Button
                      mode="contained-tonal"
                      loading={uploadingDocType === docDef.docType}
                      onPress={() => uploadVehicleDocument(docDef.docType, docDef.title)}
                    >
                      {uploaded ? "Reupload" : "Upload"}
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollFill}
        contentContainerStyle={[styles.pageContent, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card mode="contained" style={styles.headerCard}>
          <Card.Content>
            <SectionTitleRow
              icon="office-building-outline"
              title="Fleet company"
              subtitle="Work independently or join a fleet. Approval is required before using company vehicles."
              iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
              iconColor={theme.colors.primary}
              subtitleColor={theme.colors.onSurfaceVariant}
            />

            {membershipQuery.data?.isDisabledByCompany ? (
              <Banner visible icon="alert-circle">
                {membershipQuery.data.disabledReason ||
                  "You are disabled by your fleet company. Use a personal vehicle for independent jobs if enabled."}
              </Banner>
            ) : null}

            <View style={styles.modeCard}>
              <View style={styles.modeRow}>
                <Checkbox
                  status={workIndependent ? "checked" : "unchecked"}
                  onPress={() => {
                    const next = !workIndependent;
                    setWorkIndependent(next);
                    preferencesMutation.mutate(next);
                  }}
                  disabled={preferencesMutation.isPending}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall">Work independently</Text>
                  <Text style={styles.meta}>
                    Receive customer offers when your active vehicle is your personal vehicle.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.modeCard}>
              <View style={styles.modeRow}>
                <Checkbox
                  status={joinFleet ? "checked" : "unchecked"}
                  onPress={() => setJoinFleet((v) => !v)}
                  disabled={membershipStatus === "approved"}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.fleetTitleRow}>
                    <Text variant="titleSmall">Join a fleet company</Text>
                    {membershipStatus === "pending" ? (
                      <Chip compact>Pending</Chip>
                    ) : membershipStatus === "approved" ? (
                      <Chip compact style={styles.approvedChip}>
                        Approved
                      </Chip>
                    ) : membershipStatus === "rejected" ? (
                      <Chip compact style={styles.rejectedChip}>
                        Rejected
                      </Chip>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>
                    After approval, claim company vehicles. Jobs in a company vehicle count as company orders.
                  </Text>
                  {membershipStatus === "approved" && membershipQuery.data?.companyName ? (
                    <Text style={styles.meta}>
                      Linked to: <Text style={styles.linkedCompany}>{membershipQuery.data.companyName}</Text>
                    </Text>
                  ) : null}
                  {membershipStatus === "rejected" && membershipQuery.data?.rejectionReason ? (
                    <Text style={styles.rejectionText}>{membershipQuery.data.rejectionReason}</Text>
                  ) : null}
                </View>
              </View>

              {joinFleet && membershipStatus !== "approved" ? (
                <View style={styles.companyPickerWrap}>
                  <Text variant="labelLarge" style={styles.fieldLabel}>
                    Company
                  </Text>
                  {companiesQuery.isLoading ? (
                    <ActivityIndicator style={styles.companyLoading} />
                  ) : (
                    <Menu
                      visible={companyMenuVisible}
                      onDismiss={() => setCompanyMenuVisible(false)}
                      anchor={
                        <Button
                          mode="outlined"
                          onPress={() => setCompanyMenuVisible(true)}
                          style={styles.companyDropdownBtn}
                          contentStyle={styles.companyDropdownContent}
                          disabled={membershipStatus === "pending"}
                        >
                          {selectedCompanyLabel}
                        </Button>
                      }
                    >
                      {(companiesQuery.data ?? []).map((company) => (
                        <Menu.Item
                          key={company.id}
                          title={company.name}
                          onPress={() => {
                            setSelectedCompanyId(company.id);
                            setCompanyMenuVisible(false);
                          }}
                        />
                      ))}
                    </Menu>
                  )}
                  {!companiesQuery.isLoading && (companiesQuery.data ?? []).length === 0 ? (
                    <Text style={styles.meta}>No companies available.</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.fleetActions}>
                {(membershipStatus === "none" || membershipStatus === "rejected") && joinFleet ? (
                  <Button
                    mode="contained"
                    compact
                    icon="send"
                    buttonColor={theme.colors.primary}
                    textColor={theme.colors.onPrimary}
                    onPress={() => applyMutation.mutate()}
                    loading={applyMutation.isPending}
                    disabled={!selectedCompanyId || applyMutation.isPending}
                  >
                    Apply
                  </Button>
                ) : null}
                {membershipStatus === "pending" ? (
                  <Button
                    mode="outlined"
                    onPress={() => cancelApplyMutation.mutate()}
                    loading={cancelApplyMutation.isPending}
                  >
                    Cancel application
                  </Button>
                ) : null}
                {membershipStatus === "approved" ? (
                  <Button mode="outlined" onPress={() => leaveMutation.mutate()} loading={leaveMutation.isPending}>
                    Leave company
                  </Button>
                ) : null}
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card mode="contained" style={[styles.headerCard, styles.activeVehicleCard]}>
          <Card.Content>
            <SectionTitleRow
              icon="steering"
              title="Vehicle for jobs"
              subtitle="Choose the vehicle used for customer offers. Company vs personal affects how jobs are attributed."
              iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
              iconColor={theme.colors.primary}
              subtitleColor={theme.colors.onSurfaceVariant}
            />
            {!activeVehicleId && !activeVehicleQuery.isLoading ? (
              <Banner visible icon="alert">
                No active vehicle selected. You will not receive new customer offers until you choose one below.
              </Banner>
            ) : null}
            {activeVehicleQuery.isLoading || vehiclesQuery.isLoading ? (
              <ActivityIndicator style={styles.companyLoading} />
            ) : vehicles.length === 0 ? (
              <Text style={styles.meta}>Add a personal vehicle or claim a company vehicle first.</Text>
            ) : (
              vehicles.map((item) => {
                const isActive = activeVehicleId === item.id;
                return (
                  <Card key={`active-${item.id}`} mode="outlined" style={styles.activeVehicleRow}>
                    <Card.Content>
                      <View style={styles.vehicleTitleRow}>
                        <MaterialCommunityIcons
                          name={isCompanyVehicle(item) ? "car-key" : "car-outline"}
                          size={20}
                          color={theme.colors.primary}
                        />
                        <Text variant="titleMedium" style={styles.vehicleTitleFlex}>
                          {item.registrationNumber || "Vehicle"}
                        </Text>
                        {item.companyId ? (
                          <Chip compact icon="office-building" style={styles.companyFleetChip}>
                            Company
                          </Chip>
                        ) : (
                          <Chip compact icon="account">Personal</Chip>
                        )}
                        {isActive ? (
                          <Chip compact style={styles.approvedChip}>
                            Active
                          </Chip>
                        ) : null}
                      </View>
                      <Button
                        mode={isActive ? "outlined" : "contained"}
                        compact
                        icon={isActive ? "check-circle" : "play-circle-outline"}
                        buttonColor={isActive ? undefined : theme.colors.primary}
                        textColor={isActive ? undefined : theme.colors.onPrimary}
                        style={styles.poolClaimBtn}
                        disabled={isActive || setActiveVehicleMutation.isPending}
                        loading={setActiveVehicleMutation.isPending}
                        onPress={() => setActiveVehicleMutation.mutate(item.id)}
                      >
                        {isActive ? "Active" : "Use for jobs"}
                      </Button>
                      {isCompanyVehicle(item) ? (
                        <Button
                          mode="outlined"
                          compact
                          icon="export"
                          textColor={theme.colors.error}
                          style={styles.releaseFleetBtn}
                          onPress={() => confirmReleaseCompanyVehicle(item)}
                          loading={releaseCompanyVehicleMutation.isPending}
                          disabled={releaseCompanyVehicleMutation.isPending}
                        >
                          Release to pool
                        </Button>
                      ) : null}
                    </Card.Content>
                  </Card>
                );
              })
            )}
          </Card.Content>
        </Card>

        {linkedToCompany && assignedCompanyVehicles.length > 0 ? (
          <Card mode="contained" style={[styles.headerCard, styles.assignedFleetCard]}>
            <Card.Content>
              <SectionTitleRow
                icon="car-multiple"
                title="Your company vehicles"
                subtitle={`Assigned from ${membershipQuery.data?.companyName ?? "your fleet"}. Release to return to the pool.`}
                iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
                iconColor={theme.colors.primary}
                subtitleColor={theme.colors.onSurfaceVariant}
              />
              <View style={styles.poolList}>
                {assignedCompanyVehicles.map((item) => (
                  <Card key={`assigned-${item.id}`} mode="outlined" style={styles.poolVehicleCard}>
                    <Card.Content>
                      <View style={styles.vehicleTitleRow}>
                        <Text variant="titleMedium">{item.registrationNumber || "Fleet vehicle"}</Text>
                        <Chip compact style={styles.companyFleetChip}>
                          Company fleet
                        </Chip>
                      </View>
                      <IconMetaRow icon="car-info" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                        {[item.make, item.model, item.year].filter(Boolean).join(" ") || "Fleet vehicle"}
                        {item.capacityLitres != null ? ` · ${Number(item.capacityLitres).toLocaleString()} L` : ""}
                      </IconMetaRow>
                      <Button
                        mode="outlined"
                        compact
                        icon="export"
                        textColor={theme.colors.error}
                        style={styles.releaseFleetBtn}
                        onPress={() => confirmReleaseCompanyVehicle(item)}
                        loading={releaseCompanyVehicleMutation.isPending}
                        disabled={releaseCompanyVehicleMutation.isPending}
                      >
                        Release to pool
                      </Button>
                      <Button
                        mode="contained"
                        compact
                        icon="file-document-check-outline"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        style={styles.poolClaimBtn}
                        onPress={() => openCompliance(item)}
                      >
                        Compliance
                      </Button>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {linkedToCompany ? (
          <Card mode="contained" style={[styles.headerCard, styles.poolCard]}>
            <Card.Content>
              <SectionTitleRow
                icon="garage-open"
                title="Available company vehicles"
                subtitle={
                  membershipQuery.data?.companyName
                    ? `Unassigned pool from ${membershipQuery.data.companyName}. Claiming one releases your other company vehicle.`
                    : "Unassigned fleet vehicles you can claim."
                }
                iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
                iconColor={theme.colors.primary}
                subtitleColor={theme.colors.onSurfaceVariant}
              />
              {availablePoolQuery.isLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : (availablePoolQuery.data ?? []).length === 0 ? (
                <Text style={styles.meta}>
                  No unassigned vehicles in the pool right now. Ask your company to add vehicles or unassign one from
                  another driver.
                </Text>
              ) : (
                <View style={styles.poolList}>
                  {(availablePoolQuery.data ?? []).map((v) => (
                    <Card key={v.id} mode="outlined" style={styles.poolVehicleCard}>
                      <Card.Content>
                        <View style={styles.vehicleTitleRow}>
                          <MaterialCommunityIcons name="car-outline" size={20} color={theme.colors.primary} />
                          <Text variant="titleMedium" style={styles.vehicleTitleFlex}>
                            {v.registrationNumber || "Fleet vehicle"}
                          </Text>
                        </View>
                        <IconMetaRow icon="gauge" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                          {[v.make, v.model, v.year].filter(Boolean).join(" ") || "Fleet vehicle"}
                          {v.capacityLitres != null ? ` · ${Number(v.capacityLitres).toLocaleString()} L` : ""}
                        </IconMetaRow>
                        <Button
                          mode="contained"
                          compact
                          icon="car-key"
                          buttonColor={theme.colors.primary}
                          textColor={theme.colors.onPrimary}
                          style={styles.poolClaimBtn}
                          onPress={() => claimCompanyVehicleMutation.mutate(v.id)}
                          loading={claimCompanyVehicleMutation.isPending}
                          disabled={claimCompanyVehicleMutation.isPending}
                        >
                          Claim vehicle
                        </Button>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        ) : null}

        <Card mode="contained" style={styles.headerCard}>
          <Card.Content>
            <SectionTitleRow
              icon="car-outline"
              title="My vehicles"
              subtitle={
                linkedToCompany
                  ? "Personal vehicles only. Company fleet is listed above."
                  : "Your personal delivery vehicles."
              }
              iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
              iconColor={theme.colors.primary}
              subtitleColor={theme.colors.onSurfaceVariant}
            />
            <Button mode="contained" compact icon="plus" style={styles.addBtn} onPress={() => setShowAdd(true)}>
              Add vehicle
            </Button>
          </Card.Content>
        </Card>

        {vehiclesQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : vehiclesQuery.isError ? (
          <View style={styles.center}>
            <Text>Could not load vehicles.</Text>
          </View>
        ) : personalVehicles.length === 0 ? (
          <Text style={styles.empty}>
            {linkedToCompany && assignedCompanyVehicles.length > 0
              ? "No personal vehicles yet. Add one below or use a company vehicle from above."
              : "No vehicles yet. Add your first vehicle."}
          </Text>
        ) : (
          personalVehicles.map((item) => (
            <Card key={item.id} mode="outlined" style={styles.vehicleCard}>
              <Card.Content>
                <View style={styles.vehicleTitleRow}>
                  <MaterialCommunityIcons name="car-outline" size={20} color={theme.colors.primary} />
                  <Text variant="titleMedium" style={styles.vehicleTitleFlex}>
                    {item.registrationNumber || "Unnamed vehicle"}
                  </Text>
                  <Chip compact icon="account">Personal</Chip>
                </View>
                <IconMetaRow icon="car-info" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {[item.make, item.model, item.year].filter(Boolean).join(" ") || "Details not set"}
                </IconMetaRow>
                <IconMetaRow icon="gauge" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {item.capacityLitres ?? 0} L capacity
                </IconMetaRow>
                {item.fuelTypes?.length ? (
                  <View style={styles.chipsWrap}>
                    {item.fuelTypes.map((type) => (
                      <Chip key={`${item.id}-${type}`} compact>
                        {type}
                      </Chip>
                    ))}
                  </View>
                ) : null}
                <IconMetaRow icon="shield-check-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  Compliance: {item.complianceStatus || "pending"}
                </IconMetaRow>
                <View style={styles.vehicleActions}>
                  <Button
                    mode="contained"
                    compact
                    icon="file-document-check-outline"
                    style={styles.complianceBtn}
                    buttonColor={theme.colors.primary}
                    textColor={theme.colors.onPrimary}
                    onPress={() => openCompliance(item)}
                  >
                    Compliance
                  </Button>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={showAdd}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowAdd(false)}
        >
          <ModalSafeArea style={styles.addVehicleModalRoot}>
          <KeyboardAvoidingView
            style={styles.addVehicleModalRoot}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.addVehicleModalContainer}>
              <ModalScreenHeader title="Add Vehicle" onClose={() => setShowAdd(false)} />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.addVehicleModalScroll}
                showsVerticalScrollIndicator={false}
              >
                <Card mode="outlined" style={styles.addVehicleFormCard}>
                  <Card.Content>
                    <Text style={styles.addVehicleFormHint}>
                      Registration is required. Other fields help with compliance and dispatch matching.
                    </Text>
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Registration number *"
                      value={form.registration_number}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, registration_number: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Make"
                      value={form.make}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, make: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Model"
                      value={form.model}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, model: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Year"
                      keyboardType="numeric"
                      value={form.year}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, year: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Capacity (litres)"
                      keyboardType="numeric"
                      value={form.capacity_litres}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, capacity_litres: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Fuel types (comma separated)"
                      value={form.fuel_types}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, fuel_types: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="License disk expiry"
                      placeholder="YYYY-MM-DD"
                      value={form.license_disk_expiry}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, license_disk_expiry: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Roadworthy expiry"
                      placeholder="YYYY-MM-DD"
                      value={form.roadworthy_expiry}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, roadworthy_expiry: v }))}
                    />
                    <TextInput
                      {...addVehicleInputCommon}
                      label="Insurance expiry"
                      placeholder="YYYY-MM-DD"
                      value={form.insurance_expiry}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, insurance_expiry: v }))}
                    />
                  </Card.Content>
                </Card>
              </ScrollView>
              <View style={styles.addVehicleModalFooter}>
                <Button mode="outlined" onPress={() => setShowAdd(false)} style={styles.addVehicleFooterBtn}>
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  style={styles.addVehicleFooterBtn}
                  onPress={() => addVehicleMutation.mutate()}
                  loading={addVehicleMutation.isPending}
                  disabled={!form.registration_number.trim() || addVehicleMutation.isPending}
                >
                  Save vehicle
                </Button>
              </View>
            </View>
          </KeyboardAvoidingView>
          </ModalSafeArea>
        </Modal>
      </Portal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 14,
  },
  headerCard: {
    ...p.hero,
    marginBottom: 10,
  },
  subtitle: {
    ...readableType.subtitle,
    marginTop: 6,
    color: theme.colors.onSurfaceVariant,
  },
  addBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  mt12: {
    marginTop: 12,
  },
  center: p.center,
  scrollFill: {
    flex: 1,
  },
  complianceScrollContent: {
    gap: 10,
  },
  complianceHeaderText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  pageContent: {
    gap: 10,
  },
  empty: {
    ...p.empty,
    marginTop: 20,
  },
  vehicleCard: p.listCard,
  meta: {
    ...readableType.meta,
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
  },
  chipsWrap: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  complianceBtn: {
    alignSelf: "flex-start",
  },
  vehicleActions: {
    marginTop: 10,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  vehicleTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  vehicleTitleFlex: {
    flex: 1,
    minWidth: 120,
  },
  companyFleetChip: {
    backgroundColor: theme.colors.primaryContainer,
  },
  companyFleetChipText: {
    fontSize: 11,
    color: theme.colors.onPrimaryContainer,
  },
  modeCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  fleetTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  fleetActions: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 8,
  },
  approvedChip: {
    backgroundColor: theme.colors.primaryContainer,
  },
  rejectedChip: {
    backgroundColor: theme.colors.errorContainer,
  },
  linkedCompany: {
    fontWeight: "600",
    color: theme.colors.onSurface,
  },
  rejectionText: {
    marginTop: 4,
    color: theme.colors.error,
  },
  activeVehicleCard: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  activeVehicleRow: {
    marginTop: 8,
    backgroundColor: theme.colors.surface,
  },
  companyPickerWrap: {
    marginTop: 6,
  },
  fieldLabel: {
    marginBottom: 6,
    color: theme.colors.onSurface,
  },
  companyLoading: {
    marginVertical: 8,
  },
  companyDropdownBtn: {
    alignSelf: "stretch",
  },
  companyDropdownContent: {
    justifyContent: "flex-start",
  },
  poolCard: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  poolList: {
    marginTop: 8,
    gap: 10,
  },
  poolVehicleCard: {
    backgroundColor: theme.colors.surface,
  },
  poolClaimBtn: {
    marginTop: 10,
    alignSelf: "stretch",
  },
  assignedFleetCard: {
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  releaseFleetBtn: {
    marginTop: 10,
    alignSelf: "stretch",
    borderColor: theme.colors.error,
  },
  input: p.input,
  complianceSummary: p.sectionCard,
  complianceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progress: {
    marginTop: 8,
  },
  docCard: {
    backgroundColor: theme.colors.surface,
  },
  docTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  statusChip: {
    alignSelf: "flex-start",
  },
  docActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  addVehicleModalRoot: {
    flex: 1,
  },
  addVehicleModalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  addVehicleModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outline,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  addVehicleModalTitle: {
    flex: 1,
    color: theme.colors.onSurface,
    fontWeight: "700",
    paddingRight: 8,
  },
  addVehicleModalScroll: {
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  addVehicleFormCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.outline,
  },
  addVehicleFormHint: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 20,
  },
  addVehicleField: {
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
  },
  addVehicleModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outline,
  },
  addVehicleFooterBtn: {
    minWidth: 128,
  },
  });
};
