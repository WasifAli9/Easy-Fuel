import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  Menu,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { openStoredDocument, putFileToUploadUrl } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { changePasswordWithCurrent, signOut } from "@/services/api/auth";
import { saveThemeMode } from "@/services/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiThemeStore } from "@/store/ui-theme-store";

function mergeStreetAddress(line1?: string | null, line2?: string | null): string {
  const a = (line1 || "").trim();
  const b = (line2 || "").trim();
  if (!b) return a;
  if (!a) return b;
  return `${a}, ${b}`;
}

function normalizeDriverIdType(raw: string | undefined | null): string {
  if (!raw?.trim()) return "";
  const t = raw.trim();
  const u = t.toUpperCase().replace(/\s+/g, "_");
  if (u === "SA_ID" || u === "SOUTH_AFRICA" || u === "NATIONAL_ID" || u === "RSA_ID" || u === "ZA_ID") return "SA_ID";
  if (u === "PASSPORT") return "Passport";
  if (t === "Passport") return "Passport";
  return "";
}

function parseYmdToLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((s || "").trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date();
}

function formatLocalDateToYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

type KycDateKey =
  | "licenseIssue"
  | "licenseExpiry"
  | "prdpIssue"
  | "prdpExpiry"
  | "dgIssue"
  | "dgExpiry"
  | "criminal";

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

const KYC_REQUIRED_DOC_TYPES = [
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
  return (
    <Card mode="contained" style={styles.card}>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
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
    mutationFn: async () =>
      apiClient.put("/api/driver/profile", { fullName, phone: phone.trim() || null }),
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
      setPhone(profileQuery.data.phone || profileQuery.data.mobile_number || "");
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
          <TextInput mode="outlined" label="Email" value={profileQuery.data?.email || ""} disabled style={styles.input} />
          <TextInput mode="outlined" label="Mobile Number" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />
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
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idIssueCountry, setIdIssueCountry] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
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
  const [idTypeMenuOpen, setIdTypeMenuOpen] = useState(false);
  const [iosDateKey, setIosDateKey] = useState<KycDateKey | null>(null);

  const profileQuery = useQuery({
    queryKey: ["/api/driver/profile"],
    queryFn: async () => (await apiClient.get<DriverProfile>("/api/driver/profile")).data,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setIdType(normalizeDriverIdType(profileQuery.data.id_type));
    setIdNumber(profileQuery.data.id_number || "");
    setIdIssueCountry(profileQuery.data.id_issue_country || "");
    setAddressLine1(
      mergeStreetAddress(profileQuery.data.address_line_1, profileQuery.data.address_line_2),
    );
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
    mutationFn: async () => {
      const idNum = idNumber.trim();
      if (idNum && !idType.trim()) {
        throw new Error("SELECT_ID_TYPE");
      }
      const res = await apiClient.put<Record<string, unknown>>("/api/driver/compliance", {
        id_type: idType.trim() || null,
        id_number: idNum || null,
        id_issue_country: idType === "Passport" ? (idIssueCountry.trim() || null) : null,
        address_line_1: addressLine1.trim() || null,
        address_line_2: null,
        city: city.trim() || null,
        province: province.trim() || null,
        postal_code: postalCode.trim() || null,
        country: country.trim() || null,
        license_number: licenseNumber.trim() || null,
        license_code: licenseCode.trim() || null,
        license_issue_date: licenseIssueDate.trim() || null,
        license_expiry_date: licenseExpiryDate.trim() || null,
        prdp_required: prdpRequired,
        prdp_number: prdpRequired ? (prdpNumber.trim() || null) : null,
        prdp_category: prdpRequired ? (prdpCategory.trim() || null) : null,
        prdp_issue_date: prdpRequired ? (prdpIssueDate.trim() || null) : null,
        prdp_expiry_date: prdpRequired ? (prdpExpiryDate.trim() || null) : null,
        dg_training_required: dgTrainingRequired,
        dg_training_provider: dgTrainingRequired ? (dgTrainingProvider.trim() || null) : null,
        dg_training_certificate_number: dgTrainingRequired ? (dgTrainingCertificateNumber.trim() || null) : null,
        dg_training_issue_date: dgTrainingRequired ? (dgTrainingIssueDate.trim() || null) : null,
        dg_training_expiry_date: dgTrainingRequired ? (dgTrainingExpiryDate.trim() || null) : null,
        criminal_check_done: criminalCheckDone,
        criminal_check_reference: criminalCheckDone ? (criminalCheckReference.trim() || null) : null,
        criminal_check_date: criminalCheckDone ? (criminalCheckDate.trim() || null) : null,
        bank_account_holder: bankAccountHolder.trim() || null,
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        branch_code: branchCode.trim() || null,
      });
      return res.data;
    },
    onSuccess: async (data) => {
      if (!data || typeof data !== "object") {
        Alert.alert(
          "Save unclear",
          "The server returned an empty response. Pull to refresh or open the screen again to confirm your details.",
        );
        await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        return;
      }
      if ("message" in data && data.message === "No fields to update") {
        Alert.alert(
          "Nothing was saved",
          "The server did not apply any changes. Fill in at least one field, confirm ID type if you entered an ID number, and try again.",
        );
        return;
      }
      const apiErr =
        "error" in data &&
        typeof (data as { error?: unknown }).error === "string" &&
        String((data as { error: string }).error).trim().length > 0
          ? String((data as { error: string }).error).trim()
          : null;
      if (apiErr) {
        Alert.alert("Save failed", apiErr);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
      Alert.alert("Saved", "Your compliance details were saved.");
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === "SELECT_ID_TYPE") {
        Alert.alert("ID type required", "Choose South African ID or Passport before saving an ID number.");
        return;
      }
      const ax = err as { response?: { data?: { error?: string; details?: string } }; message?: string };
      const d = ax.response?.data;
      const msg =
        (typeof d?.error === "string" && d.error) ||
        (typeof d?.details === "string" && d.details) ||
        ax.message ||
        "Could not save compliance. Check your connection and that you are still signed in.";
      Alert.alert("Save failed", msg);
    },
  });
  const docsQuery = useQuery({
    queryKey: ["/api/driver/documents"],
    queryFn: async () => (await apiClient.get<DriverDocument[]>("/api/driver/documents")).data ?? [],
    refetchInterval: 8_000,
  });

  const uploadDoc = async (docType: string, title: string) => {
    setUploadingType(docType);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const file = picked.assets[0];
      const uploadMeta = (await apiClient.post("/api/objects/upload")).data as { uploadURL: string; objectPath?: string };
      const blob = await (await fetch(file.uri)).blob();
      const uploaded = await putFileToUploadUrl(
        uploadMeta.uploadURL,
        blob,
        file.mimeType || "application/octet-stream",
      );
      if (!uploaded.ok) throw new Error("Upload failed");
      const aclRes = await apiClient.put("/api/documents", { documentURL: uploadMeta.uploadURL });
      const objectPath = (aclRes.data as { objectPath?: string }).objectPath || uploadMeta.objectPath;
      if (!objectPath) throw new Error("Could not resolve uploaded file path");
      await apiClient.post("/api/driver/documents", {
        doc_type: docType,
        title,
        file_path: objectPath,
        mime_type: file.mimeType || null,
        file_size: file.size || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
    } catch (e) {
      Alert.alert("Upload failed", (e as Error)?.message || "Could not upload document.");
    } finally {
      setUploadingType(null);
    }
  };

  const openDoc = async (filePath?: string) => {
    try {
      await openStoredDocument(filePath);
    } catch {
      Alert.alert("Could not open document", "Check your connection and try again.");
    }
  };

  const isDark = mode === "dark";

  const docProgress = useMemo(() => {
    const required = KYC_REQUIRED_DOC_TYPES.filter((d) => d.required);
    let approved = 0;
    for (const def of required) {
      const uploaded = (docsQuery.data ?? []).find((row) =>
        ([def.docType, ...def.aliases] as string[]).includes(row.doc_type),
      );
      const normalizedStatus = (uploaded?.verification_status || "pending").toLowerCase();
      if (normalizedStatus === "verified" || normalizedStatus === "approved") approved += 1;
    }
    return { approved, total: required.length };
  }, [docsQuery.data]);

  const progressPct = docProgress.total > 0 ? Math.round((docProgress.approved / docProgress.total) * 100) : 0;

  const getKycYmd = (key: KycDateKey): string => {
    switch (key) {
      case "licenseIssue":
        return licenseIssueDate;
      case "licenseExpiry":
        return licenseExpiryDate;
      case "prdpIssue":
        return prdpIssueDate;
      case "prdpExpiry":
        return prdpExpiryDate;
      case "dgIssue":
        return dgTrainingIssueDate;
      case "dgExpiry":
        return dgTrainingExpiryDate;
      case "criminal":
        return criminalCheckDate;
    }
  };

  const setKycYmd = (key: KycDateKey, ymd: string) => {
    switch (key) {
      case "licenseIssue":
        setLicenseIssueDate(ymd);
        break;
      case "licenseExpiry":
        setLicenseExpiryDate(ymd);
        break;
      case "prdpIssue":
        setPrdpIssueDate(ymd);
        break;
      case "prdpExpiry":
        setPrdpExpiryDate(ymd);
        break;
      case "dgIssue":
        setDgTrainingIssueDate(ymd);
        break;
      case "dgExpiry":
        setDgTrainingExpiryDate(ymd);
        break;
      case "criminal":
        setCriminalCheckDate(ymd);
        break;
    }
  };

  const openKycDatePicker = (key: KycDateKey) => {
    const cur = getKycYmd(key);
    const base = cur && /^\d{4}-\d{2}-\d{2}$/.test(cur) ? parseYmdToLocalDate(cur) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "dismissed" || !date) return;
          setKycYmd(key, formatLocalDateToYmd(date));
        },
      });
      return;
    }
    setIosDateKey(key);
  };

  const onIosKycDateChange = (event: DateTimePickerEvent, date?: Date) => {
    const key = iosDateKey;
    if (Platform.OS === "ios") {
      setIosDateKey(null);
    }
    if (event.type === "dismissed" || !date || !key) return;
    setKycYmd(key, formatLocalDateToYmd(date));
  };

  const kycDateRow = (key: KycDateKey, label: string) => {
    const value = getKycYmd(key);
    const display =
      value && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseYmdToLocalDate(value).toLocaleDateString("en-ZA", { dateStyle: "medium" })
        : "Select date";
    return (
      <View key={key} style={styles.kycDateRow}>
        <Text variant="labelLarge" style={styles.kycDateLabel}>
          {label}
        </Text>
        <Button mode="outlined" onPress={() => openKycDatePicker(key)} style={styles.input} contentStyle={styles.kycDateButtonContent}>
          {display}
        </Button>
      </View>
    );
  };

  const kycDocIcon = (docType: string) => {
    const map: Record<string, string> = {
      za_id: "card-account-details-outline",
      passport: "passport",
      proof_of_address: "map-marker-outline",
      drivers_license: "card-text-outline",
      prdp: "badge-account-horizontal-outline",
      dangerous_goods_training: "school-outline",
      criminal_check: "shield-search",
      banking_proof: "bank-outline",
      medical_fitness: "heart-pulse",
    };
    return map[docType] ?? "file-document-outline";
  };

  const statusChipStyle = (label: string) => {
    if (label === "approved") {
      return {
        backgroundColor: isDark ? "rgba(34, 197, 94, 0.22)" : "#DCFCE7",
        textColor: isDark ? "#86EFAC" : "#166534",
      };
    }
    if (label === "rejected") {
      return {
        backgroundColor: isDark ? "rgba(239, 68, 68, 0.22)" : "#FEE2E2",
        textColor: isDark ? "#FCA5A5" : "#991B1B",
      };
    }
    return {
      backgroundColor: isDark ? "rgba(251, 191, 36, 0.18)" : "#FEF3C7",
      textColor: isDark ? "#FCD34D" : "#92400E",
    };
  };

  const kycFormCard = (children: ReactNode) => (
    <Card style={[styles.card, styles.kycFormCard]} mode="contained">
      <Card.Content style={styles.kycFormCardContent}>{children}</Card.Content>
    </Card>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.kycScrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isRefetching}
          onRefresh={() => void profileQuery.refetch()}
          tintColor={theme.colors.primary}
        />
      }
    >
      {profileQuery.isError ? (
        <Text style={[styles.kycBlockHint, { color: theme.colors.error, marginBottom: 8 }]}>
          Could not load your saved details. Open this screen again or check you are signed in. Saves may fail until your profile loads.
        </Text>
      ) : null}
      <View style={styles.kycHero}>
        <View style={styles.kycHeroTopRow}>
          <View style={[styles.kycHeroIconWrap, { backgroundColor: isDark ? "rgba(38, 237, 217, 0.15)" : "rgba(38, 237, 217, 0.2)" }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={26} color={theme.colors.primary} />
          </View>
          <View style={styles.kycHeroTextCol}>
            <Text variant="headlineSmall" style={styles.kycHeroTitle}>
              Verification {"\u0026"} KYC
            </Text>
            <Text variant="bodyMedium" style={styles.kycHeroSubtitle}>
              Complete your compliance details, then upload each document. Clear PDFs or photos speed up review.
            </Text>
          </View>
        </View>

        <View style={styles.kycProgressBlock}>
          <View style={styles.kycProgressHeader}>
            <Text variant="labelLarge" style={styles.kycProgressLabel}>
              Required documents
            </Text>
            <Text variant="labelLarge" style={[styles.kycProgressCount, { color: theme.colors.primary }]}>
              {docProgress.approved}/{docProgress.total} approved
            </Text>
          </View>
          <View style={styles.kycProgressTrack}>
            <View
              style={[
                styles.kycProgressFill,
                { width: `${progressPct}%` as `${number}%`, backgroundColor: theme.colors.primary },
              ]}
            />
          </View>
        </View>
      </View>

      <Text variant="titleMedium" style={styles.kycBlockTitle}>
        Your details
      </Text>
      <Text variant="bodySmall" style={styles.kycBlockHint}>
        Save as you go — use the buttons at the end of PrDP and banking sections.
      </Text>

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section A</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            SA ID / Passport
          </Text>
          <View style={styles.twoCol}>
            <View style={styles.kycIdTypeBlock}>
              <Menu
                visible={idTypeMenuOpen}
                onDismiss={() => setIdTypeMenuOpen(false)}
                contentStyle={styles.kycMenuContent}
                anchor={
                  <Pressable
                    onPress={() => setIdTypeMenuOpen(true)}
                    style={({ pressed }) => [
                      styles.kycSelectField,
                      {
                        borderColor: theme.colors.outline,
                        backgroundColor: theme.colors.surface,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                  >
                    <View style={styles.kycSelectFieldInner}>
                      <Text style={[styles.kycSelectFloatingLabel, { color: theme.colors.primary }]}>
                        ID type <Text style={{ color: theme.colors.error }}>*</Text>
                      </Text>
                      <View style={styles.kycSelectValueRow}>
                        <Text
                          style={[
                            styles.kycSelectValueText,
                            {
                              color:
                                idType === ""
                                  ? theme.colors.onSurfaceVariant
                                  : theme.colors.onSurface,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {idType === "SA_ID"
                            ? "SA_ID — South African ID"
                            : idType === "Passport"
                              ? "Passport"
                              : "Choose an option"}
                        </Text>
                        <MaterialCommunityIcons
                          name="menu-down"
                          size={22}
                          color={theme.colors.onSurfaceVariant}
                        />
                      </View>
                    </View>
                  </Pressable>
                }
              >
                <Menu.Item
                  leadingIcon={idType === "SA_ID" ? "check" : undefined}
                  onPress={() => {
                    setIdType("SA_ID");
                    setIdTypeMenuOpen(false);
                  }}
                  title="SA_ID"
                  titleStyle={{
                    color: idType === "SA_ID" ? theme.colors.primary : theme.colors.onSurface,
                    fontWeight: idType === "SA_ID" ? "600" : "400",
                  }}
                />
                <Menu.Item
                  leadingIcon={idType === "Passport" ? "check" : undefined}
                  onPress={() => {
                    setIdType("Passport");
                    setIdTypeMenuOpen(false);
                  }}
                  title="Passport"
                  titleStyle={{
                    color: idType === "Passport" ? theme.colors.primary : theme.colors.onSurface,
                    fontWeight: idType === "Passport" ? "600" : "400",
                  }}
                />
              </Menu>
            </View>
            <TextInput mode="outlined" label="ID Number / Passport Number" value={idNumber} onChangeText={setIdNumber} style={styles.input} />
            {idType === "Passport" ? (
              <TextInput mode="outlined" label="Passport Issue Country" value={idIssueCountry} onChangeText={setIdIssueCountry} style={styles.input} />
            ) : null}
          </View>
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section B</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            Proof of address
          </Text>
          <View style={styles.twoCol}>
            <TextInput
              mode="outlined"
              label="Street address"
              value={addressLine1}
              onChangeText={setAddressLine1}
              style={styles.input}
              placeholder="Street, unit, building (one line)"
            />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <TextInput mode="outlined" label="Postal Code" value={postalCode} onChangeText={setPostalCode} style={styles.input} />
            <TextInput mode="outlined" label="Country" value={country} onChangeText={setCountry} style={styles.input} />
          </View>
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section C</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            {"Driver's license"}
          </Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="License Number *" value={licenseNumber} onChangeText={setLicenseNumber} style={styles.input} />
            <TextInput mode="outlined" label="License Code *" value={licenseCode} onChangeText={setLicenseCode} style={styles.input} />
            {kycDateRow("licenseIssue", "License issue date *")}
            {kycDateRow("licenseExpiry", "License expiry date *")}
          </View>
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section D</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            PrDP (dangerous goods)
          </Text>
          <View style={[styles.rowBetween, styles.kycSwitchRow]}>
            <Text variant="bodyLarge">PrDP required</Text>
            <Switch value={prdpRequired} onValueChange={setPrdpRequired} />
          </View>
          {prdpRequired ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="PrDP Number *" value={prdpNumber} onChangeText={setPrdpNumber} style={styles.input} />
              <TextInput mode="outlined" label="PrDP Category *" value={prdpCategory} onChangeText={setPrdpCategory} style={styles.input} />
              {kycDateRow("prdpIssue", "PrDP issue date *")}
              {kycDateRow("prdpExpiry", "PrDP expiry date *")}
            </View>
          ) : null}
          <Button
            mode="contained"
            compact
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.kycPrimaryButton}
            contentStyle={styles.kycPrimaryButtonContent}
            labelStyle={styles.kycButtonLabel}
            onPress={() => saveComplianceMutation.mutate()}
            loading={saveComplianceMutation.isPending}
          >
            Save compliance details
          </Button>
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section E</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            Dangerous goods / Hazchem training
          </Text>
          <View style={[styles.rowBetween, styles.kycSwitchRow]}>
            <Text variant="bodyLarge">Training required</Text>
            <Switch value={dgTrainingRequired} onValueChange={setDgTrainingRequired} />
          </View>
          {dgTrainingRequired ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="Training Provider" value={dgTrainingProvider} onChangeText={setDgTrainingProvider} style={styles.input} />
              <TextInput mode="outlined" label="Certificate Number" value={dgTrainingCertificateNumber} onChangeText={setDgTrainingCertificateNumber} style={styles.input} />
              {kycDateRow("dgIssue", "Training issue date *")}
              {kycDateRow("dgExpiry", "Training expiry date (if applicable)")}
            </View>
          ) : null}
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section F</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            Criminal clearance
          </Text>
          <View style={[styles.rowBetween, styles.kycSwitchRow]}>
            <Text variant="bodyLarge">Criminal check completed</Text>
            <Switch value={criminalCheckDone} onValueChange={setCriminalCheckDone} />
          </View>
          {criminalCheckDone ? (
            <View style={styles.twoCol}>
              <TextInput mode="outlined" label="Criminal Check Reference" value={criminalCheckReference} onChangeText={setCriminalCheckReference} style={styles.input} />
              {kycDateRow("criminal", "Criminal check date *")}
            </View>
          ) : null}
        </>,
      )}

      {kycFormCard(
        <>
          <Text style={styles.kycSectionLetter}>Section G</Text>
          <Text variant="titleMedium" style={styles.kycSectionTitle}>
            Payment details
          </Text>
          <View style={styles.twoCol}>
            <TextInput mode="outlined" label="Account Holder Name" value={bankAccountHolder} onChangeText={setBankAccountHolder} style={styles.input} />
            <TextInput mode="outlined" label="Bank Name" value={bankName} onChangeText={setBankName} style={styles.input} />
            <TextInput mode="outlined" label="Account Number" value={accountNumber} onChangeText={setAccountNumber} style={styles.input} />
            <TextInput mode="outlined" label="Branch Code" value={branchCode} onChangeText={setBranchCode} style={styles.input} />
          </View>
          <Button
            mode="contained"
            compact
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.kycPrimaryButton}
            contentStyle={styles.kycPrimaryButtonContent}
            labelStyle={styles.kycButtonLabel}
            onPress={() => saveComplianceMutation.mutate()}
            loading={saveComplianceMutation.isPending}
          >
            Save all compliance information
          </Button>
        </>,
      )}

      <Divider style={styles.kycDivider} />

      <Text variant="titleMedium" style={styles.kycBlockTitle}>
        Documents to upload
      </Text>
      <Text variant="bodySmall" style={styles.kycBlockHint}>
        PDF or image (JPG/PNG). Tap upload to attach a file from your device.
      </Text>

      {KYC_REQUIRED_DOC_TYPES.map((def) => {
        const uploaded = (docsQuery.data ?? []).find((d) =>
          ([def.docType, ...def.aliases] as string[]).includes(d.doc_type),
        );
        const normalizedStatus = (uploaded?.verification_status || "pending").toLowerCase();
        const statusLabel =
          normalizedStatus === "verified" || normalizedStatus === "approved"
            ? "approved"
            : normalizedStatus === "rejected"
              ? "rejected"
              : "pending";
        const chip = statusChipStyle(statusLabel);
        const iconName = kycDocIcon(def.docType);
        return (
          <Card key={def.docType} style={[styles.card, styles.kycDocCard]} mode="outlined">
            <Card.Content style={styles.kycDocCardContent}>
              <View style={styles.kycDocTopRow}>
                <View style={[styles.kycDocIconBox, { backgroundColor: isDark ? "rgba(38, 237, 217, 0.12)" : "rgba(38, 237, 217, 0.15)" }]}>
                  <MaterialCommunityIcons name={iconName as never} size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.kycDocTitleCol}>
                  <Text variant="titleSmall" style={styles.kycDocTitle} numberOfLines={2}>
                    {def.title}
                  </Text>
                  <Text style={styles.kycDocMeta}>{def.required ? "Required for verification" : "Optional"}</Text>
                  {uploaded?.created_at ? (
                    <Text style={styles.kycDocMeta}>Uploaded {new Date(uploaded.created_at).toLocaleDateString("en-ZA")}</Text>
                  ) : (
                    <Text style={styles.kycDocMetaMuted}>Not uploaded yet</Text>
                  )}
                </View>
                <Chip compact style={{ backgroundColor: chip.backgroundColor }} textStyle={{ color: chip.textColor, fontWeight: "600", fontSize: 11 }}>
                  {statusLabel}
                </Chip>
              </View>
              <View style={styles.kycDocActions}>
                <Button
                  mode="outlined"
                  compact
                  onPress={() => openDoc(uploaded?.file_path)}
                  disabled={!uploaded?.file_path}
                  style={[styles.kycDocButton, styles.kycDocButtonHalf]}
                  contentStyle={styles.kycDocButtonContent}
                  labelStyle={styles.kycDocButtonLabel}
                >
                  View
                </Button>
                <Button
                  mode="contained"
                  compact
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  loading={uploadingType === def.docType}
                  onPress={() => uploadDoc(def.docType, def.title)}
                  style={[styles.kycDocButton, styles.kycDocButtonHalf]}
                  contentStyle={styles.kycDocButtonContent}
                  labelStyle={styles.kycDocButtonLabel}
                >
                  {uploaded ? "Replace" : "Upload"}
                </Button>
              </View>
            </Card.Content>
          </Card>
        );
      })}
      {Platform.OS === "ios" && iosDateKey ? (
        <DateTimePicker
          value={parseYmdToLocalDate(getKycYmd(iosDateKey))}
          mode="date"
          display="spinner"
          onChange={onIosKycDateChange}
        />
      ) : null}
    </ScrollView>
  );
}

export function DriverSubscriptionMenuScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
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
            <Text variant="titleMedium">{plan.name}</Text>
            <Text style={styles.meta}>R {(plan.priceCents / 100).toFixed(2)} / month</Text>
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
    <>
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
      </ScrollView>
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
    </>
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

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    ...p,
    container: p.screenContainer,
    content: p.screenScrollContentCompact,
    card: p.sectionCard,
    center: p.center,
    subtitle: p.subtitle,
    meta: p.meta,
    metaStrong: p.metaStrong,
    input: p.input,
    row: p.row,
    rowBetween: p.rowBetween,
    twoCol: p.twoCol,
    empty: p.empty,
    mt8: p.mt8,
    planDetailBox: p.planDetailBox,
    errorText: p.errorText,
    pricingHeaderTextWrap: { flex: 1, minWidth: 0, paddingRight: 4 },
    pricingHistoryButton: { alignSelf: "flex-start" },
    rightAligned: { alignItems: "flex-end" },
    priceValue: { fontWeight: "700" },
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
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outline,
  },
  historyEntryInner: { paddingVertical: 6 },
  historyMeta: { marginTop: 6, color: theme.colors.onSurfaceVariant, fontSize: 13 },
  historyPrice: { marginTop: 10, color: theme.colors.onSurface, fontWeight: "600" },
  historyNotes: { marginTop: 8 },
  historyEmpty: { textAlign: "center", paddingVertical: 28 },
  historyFooter: { paddingHorizontal: 16, paddingTop: 10 },
  historyCloseButton: { borderRadius: 12 },
  historyCloseButtonContent: { paddingVertical: 10 },

    kycScrollContent: p.screenScrollContent,
    kycHero: p.hero,
    kycHeroTopRow: p.heroTopRow,
    kycHeroIconWrap: p.heroIconWrap,
    kycHeroTextCol: p.heroTextCol,
    kycHeroTitle: p.heroTitle,
    kycHeroSubtitle: p.heroSubtitle,
  kycProgressBlock: { marginTop: 18 },
  kycProgressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  kycProgressLabel: { color: theme.colors.onSurfaceVariant },
  kycProgressCount: { fontWeight: "700" },
  kycProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceVariant,
    overflow: "hidden",
  },
  kycProgressFill: { height: 8, borderRadius: 4 },
    kycBlockTitle: { ...p.blockTitle, marginTop: 6 },
    kycBlockHint: p.blockHint,
    kycFormCard: p.sectionCard,
  kycFormCardContent: { paddingVertical: 8 },
    kycSectionLetter: p.sectionKicker,
  kycSectionTitle: { marginBottom: 10, fontWeight: "600", color: theme.colors.onSurface },
  kycIdTypeBlock: { width: "100%" },
  kycMenuContent: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outline,
    minWidth: 240,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  kycSelectField: {
    borderRadius: 4,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    justifyContent: "center",
  },
  kycSelectFieldInner: { gap: 2 },
  kycSelectFloatingLabel: { fontSize: 12, fontWeight: "500", letterSpacing: 0.2, marginBottom: 2 },
  kycSelectValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kycSelectValueText: { flex: 1, fontSize: 16, lineHeight: 22 },
  kycDateRow: { marginBottom: 8, width: "100%" },
  kycDateLabel: { marginBottom: 6, color: theme.colors.onSurfaceVariant },
  kycDateButtonContent: { justifyContent: "flex-start" },
  kycSwitchRow: { marginBottom: 8, paddingVertical: 4 },
  kycPrimaryButton: { marginTop: 12, alignSelf: "flex-start", borderRadius: 8 },
  kycPrimaryButtonContent: {
    paddingVertical: 2,
    paddingHorizontal: 14,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
  },
  kycButtonLabel: { fontSize: 13, letterSpacing: 0.1, marginVertical: 0 },
  kycDocButtonContent: {
    paddingVertical: 0,
    paddingHorizontal: 10,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
  },
  kycDocButtonLabel: { fontSize: 12, marginVertical: 0 },
  kycDivider: { marginVertical: 8 },
    kycDocCard: p.listCard,
  kycDocCardContent: { paddingVertical: 8 },
  kycDocTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  kycDocIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kycDocTitleCol: { flex: 1, minWidth: 0 },
  kycDocTitle: { fontWeight: "600", color: theme.colors.onSurface },
  kycDocMeta: { marginTop: 4, fontSize: 12, color: theme.colors.onSurfaceVariant },
  kycDocMetaMuted: { marginTop: 4, fontSize: 12, color: theme.colors.outline, fontStyle: "italic" },
  kycDocActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  kycDocButton: { borderRadius: 8 },
  kycDocButtonHalf: { flex: 1 },
  });
};
