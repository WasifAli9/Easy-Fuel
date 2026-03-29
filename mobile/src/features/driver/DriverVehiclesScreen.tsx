import { useEffect, useMemo, useState } from "react";
import { FlatList, Linking, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Portal,
  ProgressBar,
  RadioButton,
  Text,
  TextInput,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

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
  mode: "independent" | "company";
  companyId: string | null;
  companyName: string | null;
  isDisabledByCompany: boolean;
  disabledReason: string | null;
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
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [workMode, setWorkMode] = useState<"independent" | "company">("independent");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const queryClient = useQueryClient();

  const membershipQuery = useQuery({
    queryKey: ["/api/driver/company-membership"],
    queryFn: async () => (await apiClient.get<CompanyMembership>("/api/driver/company-membership")).data,
    refetchInterval: 10_000,
  });

  const companiesQuery = useQuery({
    queryKey: ["/api/companies/public-list", companySearch],
    enabled: workMode === "company",
    queryFn: async () =>
      (
        await apiClient.get<PublicCompany[]>("/api/companies/public-list", {
          params: companySearch.trim() ? { q: companySearch.trim() } : {},
        })
      ).data ?? [],
  });

  useEffect(() => {
    if (!membershipQuery.data) return;
    if (membershipQuery.data.mode === "company") {
      setWorkMode("company");
      setSelectedCompanyId(membershipQuery.data.companyId || "");
    } else {
      setWorkMode("independent");
      setSelectedCompanyId("");
    }
  }, [membershipQuery.data]);

  const saveMembershipMutation = useMutation({
    mutationFn: async () => {
      const companyId = workMode === "company" ? selectedCompanyId || null : null;
      if (workMode === "company" && !companyId) {
        throw new Error("Select a fleet company.");
      }
      await apiClient.put("/api/driver/company-membership", { companyId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/company-membership"] });
    },
  });

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
      const uploadResponse = await fetch(uploadMeta.uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
        },
        body: fileBlob,
      });
      if (!uploadResponse.ok) {
        throw new Error("File upload failed.");
      }

      const aclResponse = await apiClient.put("/api/documents", {
        documentURL: uploadMeta.uploadURL,
      });
      const objectPath = (aclResponse.data as { objectPath?: string }).objectPath;
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
      const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", {
        objectPath: doc.file_path,
      });
      if (data?.signedUrl) {
        await Linking.openURL(data.signedUrl);
      }
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

  if (selectedVehicle) {
    return (
      <View style={styles.container}>
        <Card style={styles.headerCard}>
          <Card.Content style={styles.complianceHeaderRow}>
            <View>
              <Text variant="headlineSmall">Vehicle Compliance</Text>
              <Text style={styles.subtitle}>{selectedVehicle.registrationNumber || "Selected vehicle"}</Text>
            </View>
            <Button onPress={() => setSelectedVehicle(null)}>Back</Button>
          </Card.Content>
        </Card>

        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.subtitle}>Upload and manage compliance documents.</Text>

          {uploadError ? (
            <Banner visible icon="alert-circle">
              {uploadError}
            </Banner>
          ) : null}

          {complianceStatusQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            <Card style={styles.complianceSummary}>
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
              <Card key={docDef.docType} style={styles.docCard}>
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
      <Card style={styles.headerCard}>
        <Card.Content>
          <Text variant="headlineSmall">Fleet company</Text>
          <Text style={styles.subtitle}>
            Work independently or link your account to one fleet company.
          </Text>

          {membershipQuery.data?.isDisabledByCompany ? (
            <Banner visible icon="alert-circle">
              {membershipQuery.data.disabledReason ||
                "You are disabled by your fleet company. Switch to independent to continue receiving jobs."}
            </Banner>
          ) : null}

          <RadioButton.Group onValueChange={(v) => setWorkMode(v as "independent" | "company")} value={workMode}>
            <View style={styles.modeCard}>
              <View style={styles.modeRow}>
                <RadioButton value="independent" />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall">Work independently</Text>
                  <Text style={styles.meta}>Take platform jobs without a fleet company link.</Text>
                </View>
              </View>
            </View>

            <View style={styles.modeCard}>
              <View style={styles.modeRow}>
                <RadioButton value="company" />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall">Work under a fleet company</Text>
                  <Text style={styles.meta}>
                    Link your account to one company. They can view your deliveries and control fleet access.
                  </Text>
                </View>
              </View>
            </View>
          </RadioButton.Group>

          {workMode === "company" ? (
            <View style={styles.companyPickerWrap}>
              <TextInput
                mode="outlined"
                label="Search companies"
                value={companySearch}
                onChangeText={setCompanySearch}
                style={styles.input}
              />
              <View style={styles.companyList}>
                {(companiesQuery.data ?? []).slice(0, 8).map((company) => {
                  const selected = selectedCompanyId === company.id;
                  return (
                    <Button
                      key={company.id}
                      mode={selected ? "contained" : "outlined"}
                      buttonColor={selected ? theme.colors.primary : undefined}
                      textColor={selected ? theme.colors.onPrimary : theme.colors.primary}
                      onPress={() => setSelectedCompanyId(company.id)}
                      style={styles.companyBtn}
                    >
                      {company.name}
                    </Button>
                  );
                })}
                {!companiesQuery.isLoading && (companiesQuery.data ?? []).length === 0 ? (
                  <Text style={styles.meta}>No companies found.</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.mt12}
            onPress={() => saveMembershipMutation.mutate()}
            loading={saveMembershipMutation.isPending}
          >
            Save fleet settings
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.headerCard}>
        <Card.Content>
          <Text variant="headlineSmall">My Vehicles</Text>
          <Text style={styles.subtitle}>View and manage your delivery vehicles.</Text>
          <Button mode="contained" style={styles.addBtn} onPress={() => setShowAdd(true)}>
            Add Vehicle
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
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No vehicles yet. Add your first vehicle.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.vehicleCard}>
              <Card.Content>
                <Text variant="titleMedium">{item.registrationNumber || "Unnamed vehicle"}</Text>
                <Text style={styles.meta}>
                  {[item.make, item.model, item.year].filter(Boolean).join(" ") || "Vehicle details not set"}
                </Text>
                <Text style={styles.meta}>Capacity: {item.capacityLitres ?? 0} L</Text>
                {item.fuelTypes?.length ? (
                  <View style={styles.chipsWrap}>
                    {item.fuelTypes.map((type) => (
                      <Chip key={`${item.id}-${type}`} compact>
                        {type}
                      </Chip>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.meta}>Compliance: {item.complianceStatus || "pending"}</Text>
                <Button
                  mode="contained"
                  style={styles.complianceBtn}
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  onPress={() => openCompliance(item)}
                >
                  Manage Compliance
                </Button>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Portal>
        <Dialog visible={showAdd} onDismiss={() => setShowAdd(false)} style={styles.dialog}>
          <Dialog.Title>Add Vehicle</Dialog.Title>
          <Dialog.ScrollArea>
            <View style={styles.form}>
              <TextInput
                mode="outlined"
                label="Registration Number*"
                value={form.registration_number}
                onChangeText={(v) => setForm((prev) => ({ ...prev, registration_number: v }))}
              />
              <TextInput mode="outlined" label="Make" value={form.make} onChangeText={(v) => setForm((prev) => ({ ...prev, make: v }))} />
              <TextInput mode="outlined" label="Model" value={form.model} onChangeText={(v) => setForm((prev) => ({ ...prev, model: v }))} />
              <TextInput mode="outlined" label="Year" keyboardType="numeric" value={form.year} onChangeText={(v) => setForm((prev) => ({ ...prev, year: v }))} />
              <TextInput
                mode="outlined"
                label="Capacity (Litres)"
                keyboardType="numeric"
                value={form.capacity_litres}
                onChangeText={(v) => setForm((prev) => ({ ...prev, capacity_litres: v }))}
              />
              <TextInput
                mode="outlined"
                label="Fuel Types (comma separated)"
                value={form.fuel_types}
                onChangeText={(v) => setForm((prev) => ({ ...prev, fuel_types: v }))}
              />
              <TextInput
                mode="outlined"
                label="License Disk Expiry (YYYY-MM-DD)"
                value={form.license_disk_expiry}
                onChangeText={(v) => setForm((prev) => ({ ...prev, license_disk_expiry: v }))}
              />
              <TextInput
                mode="outlined"
                label="Roadworthy Expiry (YYYY-MM-DD)"
                value={form.roadworthy_expiry}
                onChangeText={(v) => setForm((prev) => ({ ...prev, roadworthy_expiry: v }))}
              />
              <TextInput
                mode="outlined"
                label="Insurance Expiry (YYYY-MM-DD)"
                value={form.insurance_expiry}
                onChangeText={(v) => setForm((prev) => ({ ...prev, insurance_expiry: v }))}
              />
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowAdd(false)}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => addVehicleMutation.mutate()}
              loading={addVehicleMutation.isPending}
              disabled={!form.registration_number.trim() || addVehicleMutation.isPending}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

      </Portal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 14,
  },
  headerCard: {
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
  },
  subtitle: {
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  empty: {
    textAlign: "center",
    color: theme.colors.onSurfaceVariant,
    marginTop: 20,
  },
  vehicleCard: {
    backgroundColor: theme.colors.surface,
  },
  meta: {
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
    marginTop: 10,
    alignSelf: "flex-start",
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
  companyPickerWrap: {
    marginTop: 6,
  },
  companyList: {
    marginTop: 8,
    gap: 8,
  },
  companyBtn: {
    justifyContent: "flex-start",
  },
  input: {
    marginTop: 8,
    backgroundColor: theme.colors.surface,
  },
  complianceSummary: {
    backgroundColor: theme.colors.surface,
  },
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
  dialog: {
    maxHeight: "90%",
  },
  form: {
    gap: 8,
    paddingBottom: 8,
  },
});
