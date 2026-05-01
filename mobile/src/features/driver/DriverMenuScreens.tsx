import { useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ExpoLocation from "expo-location";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { changePasswordWithCurrent, signOut } from "@/services/api/auth";
import { saveThemeMode } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiThemeStore } from "@/store/ui-theme-store";

type DriverProfile = {
  full_name?: string;
  phone?: string;
  email?: string;
  driver_type?: string;
  mobile_number?: string;
  id_type?: string;
  id_number?: string;
  id_issue_country?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  license_number?: string;
  license_code?: string;
  license_issue_date?: string;
  license_expiry_date?: string;
  prdp_required?: boolean;
  prdp_number?: string;
  prdp_category?: string;
  prdp_issue_date?: string;
  prdp_expiry_date?: string;
  dg_training_required?: boolean;
  dg_training_provider?: string;
  dg_training_certificate_number?: string;
  dg_training_issue_date?: string;
  dg_training_expiry_date?: string;
  criminal_check_done?: boolean;
  criminal_check_reference?: string;
  criminal_check_date?: string;
  bank_account_holder?: string;
  bank_name?: string;
  account_number?: string;
  branch_code?: string;
};

type DriverDocument = {
  id: string;
  doc_type: string;
  title?: string;
  file_path?: string;
  verification_status?: string;
  created_at?: string;
};

type DriverSubscription = {
  subscription?: { id: string; status: string; planCode?: string; nextBillingAt?: string; plan?: { name?: string } };
  hasActiveSubscription?: boolean;
};

type DriverNotification = {
  id: string;
  title?: string;
  message?: string;
  read?: boolean;
  created_at?: string;
};

type DriverPricing = {
  id?: string;
  fuelTypeId?: string;
  fuelTypeLabel?: string;
  fuelTypeCode?: string;
  fuelPricePerLiterCents?: number;
  active?: boolean;
  code?: string;
  label?: string;
  pricing?: {
    id?: string;
    fuel_price_per_liter_cents?: number;
    active?: boolean;
  } | null;
};

type DriverPricingHistory = {
  id: string;
  created_at?: string;
  notes?: string | null;
  old_price_cents?: number | null;
  new_price_cents?: number | null;
  fuel_types?: {
    label?: string;
    code?: string;
  };
};

type DriverPreferences = {
  jobRadiusPreferenceMiles?: number;
  maxRadiusMiles?: number;
  currentLat?: number;
  currentLng?: number;
  subscriptionPlanName?: string | null;
};

const driverPlanDetails: Record<
  string,
  {
    bestFor: string;
    features: string[];
  }
> = {
  starter: {
    bestFor: "Best for new drivers with lower monthly order volume.",
    features: [
      "Basic access to driver orders and delivery status updates.",
      "Vehicle and compliance management tools.",
      "Standard in-app support response time.",
    ],
  },
  professional: {
    bestFor: "Best for active drivers handling regular weekly deliveries.",
    features: [
      "Everything in Starter, with higher usage allowance.",
      "Priority processing for subscription/account support.",
      "Improved operational visibility for active delivery workflow.",
    ],
  },
  premium: {
    bestFor: "Best for high-volume professional drivers and fleet-heavy operations.",
    features: [
      "Everything in Professional, with highest usage allowance.",
      "Priority support and faster issue escalation.",
      "Built for intensive, full-time delivery operations.",
    ],
  },
};

function cardContainer(children: React.ReactNode, styles: ReturnType<typeof getStyles>) {
  return <Card style={styles.card}><Card.Content>{children}</Card.Content></Card>;
}

export function DriverProfileMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const profileQuery = useQuery({
    queryKey: ["/api/driver/profile"],
    queryFn: async () => (await apiClient.get<DriverProfile>("/api/driver/profile")).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => apiClient.put("/api/driver/profile", { full_name: fullName, phone }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] }),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      setPasswordError("");
      if (!profileQuery.data?.email) {
        throw new Error("Email address is missing for this account.");
      }
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new Error("Please complete all password fields.");
      }
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match.");
      }
      await changePasswordWithCurrent(profileQuery.data.email, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      setPasswordError((error as Error)?.message || "Failed to update password.");
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      setFullName(profileQuery.data.full_name || "");
      setPhone(profileQuery.data.phone || "");
    }
  }, [profileQuery.data]);

  if (profileQuery.isLoading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cardContainer(
        <>
          <Text variant="headlineSmall">Profile</Text>
          <Text style={styles.subtitle}>View and update your profile details.</Text>
          <TextInput mode="outlined" label="Full Name" value={fullName} onChangeText={setFullName} style={styles.input} />
          <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} style={styles.input} />
          <TextInput mode="outlined" label="Email" value={profileQuery.data?.email || ""} disabled style={styles.input} />
          <View style={styles.row}>
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save Changes</Button>
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={() => void signOut()}>Sign Out</Button>
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="headlineSmall">Change Password</Text>
          <Text style={styles.subtitle}>Update your account password.</Text>
          <TextInput
            mode="outlined"
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Confirm New Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={styles.input}
          />
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => passwordMutation.mutate()}
            loading={passwordMutation.isPending}
            disabled={passwordMutation.isPending}
            style={styles.mt8}
          >
            Update Password
          </Button>
        </>
      , styles)}
    </ScrollView>
  );
}

export function DriverKycDocumentsScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [driverType, setDriverType] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idIssueCountry, setIdIssueCountry] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseCode, setLicenseCode] = useState("");
  const [licenseIssueDate, setLicenseIssueDate] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [prdpRequired, setPrdpRequired] = useState(false);
  const [prdpNumber, setPrdpNumber] = useState("");
  const [prdpCategory, setPrdpCategory] = useState("");
  const [prdpIssueDate, setPrdpIssueDate] = useState("");
  const [prdpExpiryDate, setPrdpExpiryDate] = useState("");
  const [dgTrainingRequired, setDgTrainingRequired] = useState(false);
  const [dgTrainingProvider, setDgTrainingProvider] = useState("");
  const [dgTrainingCertificateNumber, setDgTrainingCertificateNumber] = useState("");
  const [dgTrainingIssueDate, setDgTrainingIssueDate] = useState("");
  const [dgTrainingExpiryDate, setDgTrainingExpiryDate] = useState("");
  const [criminalCheckDone, setCriminalCheckDone] = useState(false);
  const [criminalCheckReference, setCriminalCheckReference] = useState("");
  const [criminalCheckDate, setCriminalCheckDate] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");

  const profileQuery = useQuery({
    queryKey: ["/api/driver/profile"],
    queryFn: async () => (await apiClient.get<DriverProfile>("/api/driver/profile")).data,
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setDriverType(profileQuery.data.driver_type || "");
    setMobileNumber(profileQuery.data.mobile_number || profileQuery.data.phone || "");
    setIdType(profileQuery.data.id_type || "");
    setIdNumber(profileQuery.data.id_number || "");
    setIdIssueCountry(profileQuery.data.id_issue_country || "");
    setAddressLine1(profileQuery.data.address_line_1 || "");
    setAddressLine2(profileQuery.data.address_line_2 || "");
    setCity(profileQuery.data.city || "");
    setProvince(profileQuery.data.province || "");
    setPostalCode(profileQuery.data.postal_code || "");
    setCountry(profileQuery.data.country || "South Africa");
    setLicenseNumber(profileQuery.data.license_number || "");
    setLicenseCode(profileQuery.data.license_code || "");
    setLicenseIssueDate(profileQuery.data.license_issue_date || "");
    setLicenseExpiryDate(profileQuery.data.license_expiry_date || "");
    setPrdpRequired(Boolean(profileQuery.data.prdp_required));
    setPrdpNumber(profileQuery.data.prdp_number || "");
    setPrdpCategory(profileQuery.data.prdp_category || "");
    setPrdpIssueDate(profileQuery.data.prdp_issue_date || "");
    setPrdpExpiryDate(profileQuery.data.prdp_expiry_date || "");
    setDgTrainingRequired(Boolean(profileQuery.data.dg_training_required));
    setDgTrainingProvider(profileQuery.data.dg_training_provider || "");
    setDgTrainingCertificateNumber(profileQuery.data.dg_training_certificate_number || "");
    setDgTrainingIssueDate(profileQuery.data.dg_training_issue_date || "");
    setDgTrainingExpiryDate(profileQuery.data.dg_training_expiry_date || "");
    setCriminalCheckDone(Boolean(profileQuery.data.criminal_check_done));
    setCriminalCheckReference(profileQuery.data.criminal_check_reference || "");
    setCriminalCheckDate(profileQuery.data.criminal_check_date || "");
    setBankAccountHolder(profileQuery.data.bank_account_holder || "");
    setBankName(profileQuery.data.bank_name || "");
    setAccountNumber(profileQuery.data.account_number || "");
    setBranchCode(profileQuery.data.branch_code || "");
  }, [profileQuery.data]);

  const saveComplianceMutation = useMutation({
    mutationFn: async () =>
      apiClient.put("/api/driver/compliance", {
        driver_type: driverType || null,
        mobile_number: mobileNumber || null,
        id_type: idType || null,
        id_number: idNumber || null,
        id_issue_country: idType === "Passport" ? (idIssueCountry || null) : null,
        address_line_1: addressLine1 || null,
        address_line_2: addressLine2 || null,
        city: city || null,
        province: province || null,
        postal_code: postalCode || null,
        country: country || null,
        license_number: licenseNumber || null,
        license_code: licenseCode || null,
        license_issue_date: licenseIssueDate || null,
        license_expiry_date: licenseExpiryDate || null,
        prdp_required: prdpRequired,
        prdp_number: prdpRequired ? (prdpNumber || null) : null,
        prdp_category: prdpRequired ? (prdpCategory || null) : null,
        prdp_issue_date: prdpRequired ? (prdpIssueDate || null) : null,
        prdp_expiry_date: prdpRequired ? (prdpExpiryDate || null) : null,
        dg_training_required: dgTrainingRequired,
        dg_training_provider: dgTrainingRequired ? (dgTrainingProvider || null) : null,
        dg_training_certificate_number: dgTrainingRequired ? (dgTrainingCertificateNumber || null) : null,
        dg_training_issue_date: dgTrainingRequired ? (dgTrainingIssueDate || null) : null,
        dg_training_expiry_date: dgTrainingRequired ? (dgTrainingExpiryDate || null) : null,
        criminal_check_done: criminalCheckDone,
        criminal_check_reference: criminalCheckDone ? (criminalCheckReference || null) : null,
        criminal_check_date: criminalCheckDone ? (criminalCheckDate || null) : null,
        bank_account_holder: bankAccountHolder || null,
        bank_name: bankName || null,
        account_number: accountNumber || null,
        branch_code: branchCode || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
    },
  });
  const docsQuery = useQuery({
    queryKey: ["/api/driver/documents"],
    queryFn: async () => (await apiClient.get<DriverDocument[]>("/api/driver/documents")).data ?? [],
    refetchInterval: 8_000,
  });

  const requiredDocTypes = [
    { docType: "za_id", aliases: ["id_document"], title: "South African ID", required: true },
    { docType: "passport", aliases: [], title: "Passport", required: true },
    { docType: "proof_of_address", aliases: [], title: "Proof of Address", required: true },
    { docType: "drivers_license", aliases: [], title: "Driver's License", required: true },
    { docType: "prdp", aliases: ["prdp_document"], title: "Professional Driving Permit (PrDP-D)", required: true },
    {
      docType: "dangerous_goods_training",
      aliases: [],
      title: "Dangerous Goods Training Certificate",
      required: true,
    },
    { docType: "criminal_check", aliases: [], title: "Criminal Clearance", required: true },
    { docType: "banking_proof", aliases: ["bank_proof"], title: "Banking Proof", required: false },
    { docType: "medical_fitness", aliases: [], title: "Medical Fitness Certificate", required: false },
  ];

  const uploadDoc = async (docType: string, title: string) => {
    setUploadingType(docType);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], multiple: false });
      if (picked.canceled || !picked.assets?.length) return;
      const file = picked.assets[0];
      const uploadMeta = (await apiClient.post("/api/objects/upload")).data as { uploadURL: string; objectPath?: string };
      const blob = await (await fetch(file.uri)).blob();
      const uploaded = await fetch(uploadMeta.uploadURL, { method: "PUT", headers: { "Content-Type": file.mimeType || "application/octet-stream" }, body: blob });
      if (!uploaded.ok) throw new Error("Upload failed");
      let objectPath = uploadMeta.objectPath || "";
      if (!objectPath) {
        const raw = uploadMeta.uploadURL.split("?")[0];
        if (raw.includes("/api/storage/upload/")) {
          const m = raw.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
          if (m) objectPath = `${m[1]}/${m[2]}`;
        } else {
          objectPath = raw;
        }
      }
      await apiClient.put("/api/documents", { documentURL: uploadMeta.uploadURL });
      await apiClient.post("/api/driver/documents", {
        doc_type: docType,
        title,
        file_path: objectPath,
        mime_type: file.mimeType || null,
        file_size: file.size || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
    } finally {
      setUploadingType(null);
    }
  };

  const openDoc = async (filePath?: string) => {
    if (!filePath) return;
    const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", { objectPath: filePath });
    if (data?.signedUrl) await Linking.openURL(data.signedUrl);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cardContainer(
        <>
          <Text variant="headlineSmall">KYC Documents</Text>
          <Text style={styles.subtitle}>Upload and view your compliance documents.</Text>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">A. Basic Profile</Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="Driver Type" value={driverType} onChangeText={setDriverType} style={styles.input} placeholder="individual / company_driver" />
            <TextInput mode="outlined" label="Mobile Number" value={mobileNumber} onChangeText={setMobileNumber} style={styles.input} />
            <TextInput mode="outlined" label="Email" value={profileQuery.data?.email || ""} disabled style={styles.input} />
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">B. SA ID / Passport</Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="ID Type" value={idType} onChangeText={setIdType} style={styles.input} placeholder="SA_ID or Passport" />
            <TextInput mode="outlined" label="ID Number / Passport Number" value={idNumber} onChangeText={setIdNumber} style={styles.input} />
            {idType === "Passport" ? (
              <TextInput mode="outlined" label="Passport Issue Country" value={idIssueCountry} onChangeText={setIdIssueCountry} style={styles.input} />
            ) : null}
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">C. Proof of Address</Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="Address Line 1" value={addressLine1} onChangeText={setAddressLine1} style={styles.input} />
            <TextInput mode="outlined" label="Address Line 2" value={addressLine2} onChangeText={setAddressLine2} style={styles.input} />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <TextInput mode="outlined" label="Postal Code" value={postalCode} onChangeText={setPostalCode} style={styles.input} />
            <TextInput mode="outlined" label="Country" value={country} onChangeText={setCountry} style={styles.input} />
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">D. Driver's License</Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="License Number *" value={licenseNumber} onChangeText={setLicenseNumber} style={styles.input} />
            <TextInput mode="outlined" label="License Code *" value={licenseCode} onChangeText={setLicenseCode} style={styles.input} />
            <TextInput mode="outlined" label="License Issue Date * (YYYY-MM-DD)" value={licenseIssueDate} onChangeText={setLicenseIssueDate} style={styles.input} />
            <TextInput mode="outlined" label="License Expiry Date * (YYYY-MM-DD)" value={licenseExpiryDate} onChangeText={setLicenseExpiryDate} style={styles.input} />
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">E. Professional Driving Permit (PrDP - Dangerous Goods)</Text>
          <View style={styles.rowBetween}>
            <Text>PrDP Required</Text>
            <Switch value={prdpRequired} onValueChange={setPrdpRequired} />
          </View>
          {prdpRequired ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="PrDP Number *" value={prdpNumber} onChangeText={setPrdpNumber} style={styles.input} />
              <TextInput mode="outlined" label="PrDP Category *" value={prdpCategory} onChangeText={setPrdpCategory} style={styles.input} />
              <TextInput mode="outlined" label="PrDP Issue Date * (YYYY-MM-DD)" value={prdpIssueDate} onChangeText={setPrdpIssueDate} style={styles.input} />
              <TextInput mode="outlined" label="PrDP Expiry Date * (YYYY-MM-DD)" value={prdpExpiryDate} onChangeText={setPrdpExpiryDate} style={styles.input} />
            </View>
          ) : null}
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.mt8}
            onPress={() => saveComplianceMutation.mutate()}
            loading={saveComplianceMutation.isPending}
          >
            Save Compliance Details
          </Button>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">F. Dangerous Goods / Hazchem Training</Text>
          <View style={styles.rowBetween}>
            <Text>Dangerous Goods Training Required</Text>
            <Switch value={dgTrainingRequired} onValueChange={setDgTrainingRequired} />
          </View>
          {dgTrainingRequired ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="Training Provider" value={dgTrainingProvider} onChangeText={setDgTrainingProvider} style={styles.input} />
              <TextInput mode="outlined" label="Certificate Number" value={dgTrainingCertificateNumber} onChangeText={setDgTrainingCertificateNumber} style={styles.input} />
              <TextInput mode="outlined" label="Training Issue Date (YYYY-MM-DD)" value={dgTrainingIssueDate} onChangeText={setDgTrainingIssueDate} style={styles.input} />
              <TextInput mode="outlined" label="Training Expiry Date (YYYY-MM-DD)" value={dgTrainingExpiryDate} onChangeText={setDgTrainingExpiryDate} style={styles.input} />
            </View>
          ) : null}
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">G. Criminal / Clearance</Text>
          <View style={styles.rowBetween}>
            <Text>Criminal Check Completed</Text>
            <Switch value={criminalCheckDone} onValueChange={setCriminalCheckDone} />
          </View>
          {criminalCheckDone ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="Criminal Check Reference" value={criminalCheckReference} onChangeText={setCriminalCheckReference} style={styles.input} />
              <TextInput mode="outlined" label="Criminal Check Date (YYYY-MM-DD)" value={criminalCheckDate} onChangeText={setCriminalCheckDate} style={styles.input} />
            </View>
          ) : null}
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="titleLarge">2. Driver - Bank & Payment Details</Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="Account Holder Name" value={bankAccountHolder} onChangeText={setBankAccountHolder} style={styles.input} />
            <TextInput mode="outlined" label="Bank Name" value={bankName} onChangeText={setBankName} style={styles.input} />
            <TextInput mode="outlined" label="Account Number" value={accountNumber} onChangeText={setAccountNumber} style={styles.input} />
            <TextInput mode="outlined" label="Branch Code" value={branchCode} onChangeText={setBranchCode} style={styles.input} />
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.mt8}
            onPress={() => saveComplianceMutation.mutate()}
            loading={saveComplianceMutation.isPending}
          >
            Save All Compliance Information
          </Button>
        </>
      , styles)}
      {requiredDocTypes.map((def) => {
        const uploaded = (docsQuery.data ?? []).find((d) => [def.docType, ...def.aliases].includes(d.doc_type));
        const normalizedStatus = (uploaded?.verification_status || "pending").toLowerCase();
        const statusLabel =
          normalizedStatus === "verified" || normalizedStatus === "approved"
            ? "approved"
            : normalizedStatus === "rejected"
              ? "rejected"
              : "pending";
        return (
          <Card key={def.docType} style={styles.card}>
            <Card.Content>
              <View style={styles.rowBetween}>
                <View>
                  <Text variant="titleSmall">{def.title}</Text>
                  <Text style={styles.meta}>{def.required ? "Required" : "Optional"}</Text>
                </View>
                <Chip compact>{statusLabel}</Chip>
              </View>
              {uploaded?.created_at ? <Text style={styles.meta}>Uploaded: {new Date(uploaded.created_at).toLocaleDateString("en-ZA")}</Text> : null}
              <View style={styles.row}>
                <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} disabled={!uploaded?.file_path} onPress={() => openDoc(uploaded?.file_path)}>View</Button>
                <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} loading={uploadingType === def.docType} onPress={() => uploadDoc(def.docType, def.title)}>
                  {uploaded ? "Reupload" : "Upload"}
                </Button>
              </View>
            </Card.Content>
          </Card>
        );
      })}
    </ScrollView>
  );
}

export function DriverSubscriptionMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [expandedPlanCode, setExpandedPlanCode] = useState<string | null>(null);
  const subQuery = useQuery({
    queryKey: ["/api/driver/subscription"],
    queryFn: async () => (await apiClient.get<DriverSubscription>("/api/driver/subscription")).data,
  });
  const plansQuery = useQuery({
    queryKey: ["/api/driver/subscription/plans"],
    queryFn: async () => (await apiClient.get<{ plans: Array<{ code: string; name: string; priceCents: number }> }>("/api/driver/subscription/plans")).data,
  });
  const createMutation = useMutation({
    mutationFn: async (planCode: string) => apiClient.post("/api/driver/subscription/create-payment", { planCode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/subscription"] }),
  });
  const cancelMutation = useMutation({
    mutationFn: async () => apiClient.post("/api/driver/subscription/cancel"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/subscription"] }),
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cardContainer(
        <>
          <Text variant="headlineSmall">Subscription</Text>
          <Text style={styles.subtitle}>Manage driver subscription and plans.</Text>
          <Text>Status: {subQuery.data?.subscription?.status || "none"}</Text>
          <Text>Plan: {subQuery.data?.subscription?.plan?.name || subQuery.data?.subscription?.planCode || "-"}</Text>
          <Text>Next billing: {subQuery.data?.subscription?.nextBillingAt ? new Date(subQuery.data.subscription.nextBillingAt).toLocaleDateString("en-ZA") : "-"}</Text>
          <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={() => cancelMutation.mutate()} loading={cancelMutation.isPending} style={styles.mt8}>
            Cancel Subscription
          </Button>
        </>
      , styles)}
      {(plansQuery.data?.plans || []).map((plan) => (
        <Card key={plan.code} style={styles.card}>
          <Card.Content>
            <View style={styles.rowBetween}>
              <Text variant="titleMedium">{plan.name}</Text>
              <Button
                mode="text"
                onPress={() => setExpandedPlanCode((prev) => (prev === plan.code ? null : plan.code))}
              >
                {expandedPlanCode === plan.code ? "Hide details" : "Show details"}
              </Button>
            </View>
            <Text style={styles.meta}>R {(plan.priceCents / 100).toFixed(2)} / month</Text>
            {expandedPlanCode === plan.code ? (
              <View style={styles.planDetailBox}>
                <Text style={styles.metaStrong}>
                  {driverPlanDetails[plan.code.toLowerCase()]?.bestFor || "Plan details for this subscription tier."}
                </Text>
                {(driverPlanDetails[plan.code.toLowerCase()]?.features || [
                  "Access to driver portal workflows.",
                  "Monthly billing with subscription management in-app.",
                ]).map((feature) => (
                  <Text key={`${plan.code}-${feature}`} style={styles.meta}>
                    - {feature}
                  </Text>
                ))}
              </View>
            ) : null}
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} style={styles.mt8} onPress={() => createMutation.mutate(plan.code)} loading={createMutation.isPending}>
              Choose {plan.name}
            </Button>
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

export function DriverNotificationsMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => (await apiClient.get<DriverNotification[]>("/api/notifications")).data ?? [],
    refetchInterval: 8_000,
  });
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  return (
    <View style={styles.container}>
      {notificationsQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={notificationsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>No notifications.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleSmall">{item.title || "Notification"}</Text>
                <Text style={styles.meta}>{item.message || "-"}</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.meta}>{item.created_at ? new Date(item.created_at).toLocaleString("en-ZA") : ""}</Text>
                  {!item.read ? (
                    <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={() => markReadMutation.mutate(item.id)} loading={markReadMutation.isPending}>Mark read</Button>
                  ) : <Chip compact>Read</Chip>}
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </View>
  );
}

export function DriverPricingMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const pricingQuery = useQuery({
    queryKey: ["/api/driver/pricing"],
    queryFn: async () => (await apiClient.get<DriverPricing[]>("/api/driver/pricing")).data ?? [],
  });
  const historyQuery = useQuery({
    queryKey: ["/api/driver/pricing/history"],
    queryFn: async () => (await apiClient.get<DriverPricingHistory[]>("/api/driver/pricing/history")).data ?? [],
    enabled: historyVisible,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ fuelTypeId, cents, note }: { fuelTypeId: string; cents: number; note?: string }) =>
      apiClient.put(`/api/driver/pricing/${fuelTypeId}`, {
        fuel_price_per_liter_cents: cents,
        fuelPricePerLiterCents: cents,
        ...(note ? { notes: note } : {}),
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/pricing"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/pricing/history"] });
      setNotes((prev) => {
        const next = { ...prev };
        delete next[variables.fuelTypeId];
        return next;
      });
    },
  });

  const pricingItems = (pricingQuery.data ?? []).map((item, index) => {
    const fuelTypeId = item.fuelTypeId || item.id || `fuel-${index}`;
    const label = item.fuelTypeLabel || item.label || "Fuel";
    const code = item.fuelTypeCode || item.code || "";
    const priceCents = item.fuelPricePerLiterCents ?? item.pricing?.fuel_price_per_liter_cents ?? 0;
    return { fuelTypeId, label, code, priceCents };
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cardContainer(
        <>
          <View style={styles.rowBetween}>
            <View style={styles.pricingHeaderTextWrap}>
              <Text variant="headlineSmall">Pricing</Text>
              <Text style={styles.subtitle}>Set your fuel prices per liter for each fuel type.</Text>
            </View>
            <Button
              mode="contained"
              compact
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => setHistoryVisible(true)}
              style={styles.pricingHistoryButton}
            >
              History
            </Button>
          </View>
        </>
      , styles)}
      {pricingItems.map((item, index) => {
        const draft = drafts[item.fuelTypeId] ?? (item.priceCents / 100).toFixed(2);
        return (
          <Card key={`${item.fuelTypeId}-${index}`} style={styles.card}>
            <Card.Content>
              <View style={styles.rowBetween}>
                <View>
                  <Text variant="titleSmall">{item.label}</Text>
                  <Text style={styles.meta}>{item.code.toUpperCase()}</Text>
                </View>
                <View style={styles.rightAligned}>
                  <Text variant="titleLarge" style={styles.priceValue}>
                    R {(item.priceCents / 100).toFixed(2)}
                  </Text>
                  <Text style={styles.meta}>per liter</Text>
                </View>
              </View>
              <TextInput
                mode="outlined"
                label="Price per Litre (ZAR)"
                value={draft}
                onChangeText={(v) => setDrafts((p) => ({ ...p, [item.fuelTypeId]: v }))}
                style={styles.input}
                keyboardType="numeric"
              />
              <TextInput
                mode="outlined"
                label="Notes (Optional)"
                value={notes[item.fuelTypeId] || ""}
                onChangeText={(v) => setNotes((p) => ({ ...p, [item.fuelTypeId]: v }))}
                style={styles.input}
                multiline
              />
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                style={styles.mt8}
                onPress={() =>
                  updateMutation.mutate({
                    fuelTypeId: item.fuelTypeId,
                    cents: Math.round((Number(draft) || 0) * 100),
                    note: notes[item.fuelTypeId] || undefined,
                  })
                }
                loading={updateMutation.isPending}
              >
                Save
              </Button>
            </Card.Content>
          </Card>
        );
      })}
      <Modal
        visible={historyVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.historyBackdrop}>
          <Pressable style={styles.historyBackdropTap} onPress={() => setHistoryVisible(false)} />
          <View
            style={[
              styles.historySheet,
              {
                maxHeight: windowHeight * 0.88,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.historyHeader}>
              <View style={styles.historyHeaderText}>
                <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>
                  Pricing History
                </Text>
                <Text style={styles.subtitle}>Recent updates to your per-liter prices.</Text>
              </View>
              <IconButton
                icon="close"
                size={22}
                accessibilityLabel="Close pricing history"
                onPress={() => setHistoryVisible(false)}
              />
            </View>
            {historyQuery.isPending ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <FlatList
                data={historyQuery.data ?? []}
                keyExtractor={(entry, idx) => `${entry.id}-${idx}`}
                style={{ maxHeight: windowHeight * 0.55 }}
                contentContainerStyle={styles.historyListContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={[styles.meta, styles.historyEmpty]}>No pricing history yet.</Text>}
                renderItem={({ item: entry }) => (
                  <Card style={styles.historyEntryCard} mode="outlined">
                    <Card.Content style={styles.historyEntryInner}>
                      <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                        {entry.fuel_types?.label || "Fuel"}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {entry.created_at ? new Date(entry.created_at).toLocaleString("en-ZA") : "—"}
                      </Text>
                      <Text variant="titleMedium" style={styles.historyPrice}>
                        {entry.old_price_cents != null
                          ? `R ${(entry.old_price_cents / 100).toFixed(2)} → R ${((entry.new_price_cents ?? 0) / 100).toFixed(2)}`
                          : `R ${((entry.new_price_cents ?? 0) / 100).toFixed(2)}`}
                      </Text>
                      {entry.notes ? (
                        <Text style={[styles.historyMeta, styles.historyNotes]} numberOfLines={4}>
                          {entry.notes}
                        </Text>
                      ) : null}
                    </Card.Content>
                  </Card>
                )}
              />
            )}
            <View style={styles.historyFooter}>
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                onPress={() => setHistoryVisible(false)}
                style={styles.historyCloseButton}
                contentStyle={styles.historyCloseButtonContent}
              >
                Close
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export function DriverHistoryMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const completedOrdersQuery = useQuery({
    queryKey: ["/api/driver/completed-orders"],
    queryFn: async () => (await apiClient.get<any[]>("/api/driver/completed-orders")).data ?? [],
  });
  const depotOrdersQuery = useQuery({
    queryKey: ["/api/driver/depot-orders"],
    queryFn: async () => (await apiClient.get<any[]>("/api/driver/depot-orders")).data ?? [],
  });
  const history = useMemo(() => {
    const delivery = (completedOrdersQuery.data ?? []).map((o) => ({
      id: `delivery-${o.id}`,
      title: `Delivery #${String(o.id).slice(-8)}`,
      subtitle: `${o.fuel_types?.label || "Fuel"} ${o.litres || ""}L`,
      status: o.state || "delivered",
      date: o.delivered_at || o.created_at,
    }));
    const depot = (depotOrdersQuery.data ?? [])
      .filter((o) => ["completed", "cancelled", "rejected"].includes(o.status))
      .map((o) => ({
        id: `depot-${o.id}`,
        title: `Depot order #${String(o.id).slice(-8)}`,
        subtitle: `${o.depots?.name || "Depot"} • ${o.fuel_types?.label || "Fuel"}`,
        status: o.status,
        date: o.updated_at || o.created_at,
      }));
    return [...delivery, ...depot].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [completedOrdersQuery.data, depotOrdersQuery.data]);

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.empty}>No history yet.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.rowBetween}>
                <Text variant="titleSmall">{item.title}</Text>
                <Chip compact>{item.status}</Chip>
              </View>
              <Text style={styles.meta}>{item.subtitle}</Text>
              <Text style={styles.meta}>{item.date ? new Date(item.date).toLocaleString("en-ZA") : ""}</Text>
            </Card.Content>
          </Card>
        )}
      />
    </View>
  );
}

export function DriverSettingsMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const themeMode = useUiThemeStore((state) => state.mode);
  const setThemeMode = useUiThemeStore((state) => state.setMode);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const preferencesQuery = useQuery({
    queryKey: ["/api/driver/preferences"],
    queryFn: async () => (await apiClient.get<DriverPreferences>("/api/driver/preferences")).data,
  });
  useEffect(() => {
    if (preferencesQuery.data) {
      setLat(String(preferencesQuery.data.currentLat ?? ""));
      setLng(String(preferencesQuery.data.currentLng ?? ""));
    }
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiClient.patch("/api/driver/preferences", {
        currentLat: Number(lat),
        currentLng: Number(lng),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/preferences"] }),
  });

  const useCurrentLocation = async () => {
    const perm = await ExpoLocation.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return;
    const current = await ExpoLocation.getCurrentPositionAsync({});
    setLat(String(current.coords.latitude));
    setLng(String(current.coords.longitude));
  };

  const toggleTheme = async (nextDarkEnabled: boolean) => {
    const nextMode = nextDarkEnabled ? "dark" : "light";
    setThemeMode(nextMode);
    await saveThemeMode(nextMode);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cardContainer(
        <>
          <Text variant="headlineSmall">Appearance</Text>
          <Text style={styles.subtitle}>Match app theme with web light/dark modes.</Text>
          <View style={styles.rowBetween}>
            <Text>Dark mode</Text>
            <Switch value={themeMode === "dark"} onValueChange={toggleTheme} />
          </View>
        </>
      , styles)}
      {cardContainer(
        <>
          <Text variant="headlineSmall">Settings</Text>
          <Text style={styles.subtitle}>Job preferences and location.</Text>
          <Text style={styles.meta}>Plan: {preferencesQuery.data?.subscriptionPlanName || "No active plan"}</Text>
          <Text style={styles.meta}>Max radius: {preferencesQuery.data?.maxRadiusMiles ?? 0} miles</Text>
          <Text style={styles.meta}>Pickup radius is managed automatically by your subscription tier.</Text>
          <TextInput mode="outlined" label="Latitude" value={lat} onChangeText={setLat} style={styles.input} />
          <TextInput mode="outlined" label="Longitude" value={lng} onChangeText={setLng} style={styles.input} />
          <View style={styles.row}>
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={useCurrentLocation}>Use Current Location</Button>
            <Button mode="contained" buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save Preferences</Button>
          </View>
        </>
      , styles)}
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 14, gap: 10, paddingBottom: 20 },
  card: { backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
  meta: { marginTop: 4, color: theme.colors.onSurfaceVariant },
  metaStrong: { marginTop: 2, marginBottom: 2, color: theme.colors.onSurface, fontWeight: "600" },
  input: { marginTop: 8, backgroundColor: theme.colors.surface },
  row: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  pricingHeaderTextWrap: { flex: 1, minWidth: 0, paddingRight: 4 },
  pricingHistoryButton: { alignSelf: "flex-start" },
  twoCol: { marginTop: 8, gap: 8 },
  rightAligned: { alignItems: "flex-end" },
  priceValue: { fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 24, color: theme.colors.onSurfaceVariant },
  mt8: { marginTop: 8 },
  planDetailBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 10,
    backgroundColor: theme.colors.background,
  },
  errorText: { marginTop: 8, color: "#DC2626" },
  historyBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  historyBackdropTap: { ...StyleSheet.absoluteFillObject },
  historySheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outline,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outline,
  },
  historyHeaderText: { flex: 1, paddingRight: 4 },
  historyLoading: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  historyListContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, flexGrow: 1 },
  historyEntryCard: {
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
  },
  historyEntryInner: { paddingVertical: 6 },
  historyMeta: { marginTop: 6, color: theme.colors.onSurfaceVariant, fontSize: 13 },
  historyPrice: { marginTop: 10, color: theme.colors.onSurface, fontWeight: "600" },
  historyNotes: { marginTop: 8 },
  historyEmpty: { textAlign: "center", paddingVertical: 28 },
  historyFooter: { paddingHorizontal: 16, paddingTop: 10 },
  historyCloseButton: { borderRadius: 12 },
  historyCloseButtonContent: { paddingVertical: 10 },
});
