import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Card,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { Button } from "@/design/paper-button";
import { IosDatePickerSheet } from "@/components/IosDatePickerSheet";
import { KycInlineDocumentRow } from "@/components/KycInlineDocumentRow";
import { apiClient } from "@/services/api/client";
import { downloadStoredDocument, putFileToUploadUrl, readUploadObjectPath } from "@/lib/files";
import {
  COMPLIANCE_DOCUMENT_MIME,
  complianceDocumentDownloadMeta,
  compliancePdfOnlyError,
  isCompliancePdfUpload,
} from "@/lib/compliance-document-upload";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

const KYB_REQUIRED_DOC_TYPES = [
  { docType: "cipc_certificate", title: "CIPC Certificate", required: true },
  { docType: "vat_certificate", title: "VAT Certificate", required: true },
  { docType: "tax_clearance", title: "SARS Tax Clearance Certificate", required: true },
  { docType: "dmre_license", title: "DMRE Wholesale Fuel License", required: true },
  { docType: "site_license", title: "Site License", required: true },
  { docType: "environmental_authorisation", title: "Environmental Authorisation", required: true },
  { docType: "fire_certificate", title: "Fire Department Certificate", required: true },
  { docType: "sabs_certificate", title: "SABS Fuel Quality Certificate", required: true },
  { docType: "calibration_certificate", title: "Pump/Meter Calibration Certificate", required: true },
  { docType: "public_liability_insurance", title: "Public Liability Insurance", required: true },
] as const;

type KybDateKey =
  | "vatExpiry"
  | "taxExpiry"
  | "wholesaleIssue"
  | "wholesaleExpiry"
  | "fireIssue"
  | "fireExpiry"
  | "hseUpdated"
  | "sabsIssue"
  | "sabsExpiry"
  | "calibrationIssue"
  | "calibrationExpiry"
  | "liabilityExpiry";

type SupplierDocument = {
  id: string;
  doc_type: string;
  title?: string;
  file_path?: string;
  mime_type?: string | null;
  verification_status?: string;
  created_at?: string;
};

type FuelType = {
  id: string;
  code: string;
  label: string;
};

type KybReadiness = {
  can_submit?: boolean;
  canSubmit?: boolean;
  missing_docs?: string[];
  missingDocs?: string[];
  missing_fields?: string[];
  missingFields?: string[];
  package_submitted_at?: string | null;
  packageSubmittedAt?: string | null;
  overall_status?: string;
  overallStatus?: string;
};

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

function profileDateYmd(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return formatLocalDateToYmd(new Date(s));
  } catch {
    return "";
  }
}

function directorNamesToText(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  return "";
}

function textToDirectorNames(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function nonempty(v: string): boolean {
  return v.trim().length > 0;
}

/** Red asterisk for required field labels (React Native Paper accepts ReactNode labels). */
function reqLabel(text: string) {
  return (
    <>
      {text}
      <Text style={{ color: "#DC2626", fontWeight: "700" }}> *</Text>
    </>
  );
}

const SATISFYING_DOC_STATUSES = new Set(["draft", "pending", "pending_review", "approved", "verified"]);

function isDocSatisfying(status: string | null | undefined): boolean {
  if (!status) return false;
  return SATISFYING_DOC_STATUSES.has(String(status).toLowerCase());
}

export function SupplierKycDocumentsScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [downloadingDocType, setDownloadingDocType] = useState<string | null>(null);
  const [iosDateKey, setIosDateKey] = useState<KybDateKey | null>(null);
  const [iosPickerDraft, setIosPickerDraft] = useState(() => new Date());

  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [directorNames, setDirectorNames] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [vatCertificateExpiry, setVatCertificateExpiry] = useState("");
  const [taxClearanceNumber, setTaxClearanceNumber] = useState("");
  const [taxClearanceExpiry, setTaxClearanceExpiry] = useState("");
  const [wholesaleLicenseNumber, setWholesaleLicenseNumber] = useState("");
  const [wholesaleLicenseIssueDate, setWholesaleLicenseIssueDate] = useState("");
  const [wholesaleLicenseExpiryDate, setWholesaleLicenseExpiryDate] = useState("");
  const [allowedFuelTypes, setAllowedFuelTypes] = useState<string[]>([]);
  const [siteLicenseNumber, setSiteLicenseNumber] = useState("");
  const [depotAddress, setDepotAddress] = useState("");
  const [environmentalAuthNumber, setEnvironmentalAuthNumber] = useState("");
  const [approvedStorageCapacity, setApprovedStorageCapacity] = useState("");
  const [fireCertificateNumber, setFireCertificateNumber] = useState("");
  const [fireCertificateIssueDate, setFireCertificateIssueDate] = useState("");
  const [fireCertificateExpiryDate, setFireCertificateExpiryDate] = useState("");
  const [hseFileVerified, setHseFileVerified] = useState(false);
  const [hseFileLastUpdated, setHseFileLastUpdated] = useState("");
  const [spillComplianceConfirmed, setSpillComplianceConfirmed] = useState(false);
  const [sabsCertificateNumber, setSabsCertificateNumber] = useState("");
  const [sabsCertificateIssueDate, setSabsCertificateIssueDate] = useState("");
  const [sabsCertificateExpiryDate, setSabsCertificateExpiryDate] = useState("");
  const [calibrationCertificateNumber, setCalibrationCertificateNumber] = useState("");
  const [calibrationCertificateIssueDate, setCalibrationCertificateIssueDate] = useState("");
  const [calibrationCertificateExpiryDate, setCalibrationCertificateExpiryDate] = useState("");
  const [publicLiabilityPolicyNumber, setPublicLiabilityPolicyNumber] = useState("");
  const [publicLiabilityProvider, setPublicLiabilityProvider] = useState("");
  const [publicLiabilityCoverage, setPublicLiabilityCoverage] = useState("");
  const [publicLiabilityPolicyExpiryDate, setPublicLiabilityPolicyExpiryDate] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get<Record<string, unknown>>("/api/supplier/profile")).data,
    refetchOnWindowFocus: false,
  });
  const fuelTypesQuery = useQuery({
    queryKey: ["/api/fuel-types"],
    queryFn: async () => (await apiClient.get<FuelType[]>("/api/fuel-types")).data ?? [],
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setCompanyName(String(p.registered_name ?? p.company_name ?? ""));
    setRegistrationNumber(String(p.registration_number ?? p.cipc_number ?? ""));
    setRegisteredAddress(String(p.registered_address ?? ""));
    setDirectorNames(directorNamesToText(p.director_names));
    setVatNumber(String(p.vat_number ?? ""));
    setVatCertificateExpiry(profileDateYmd(p.vat_certificate_expiry));
    setTaxClearanceNumber(String(p.tax_clearance_number ?? ""));
    setTaxClearanceExpiry(profileDateYmd(p.tax_clearance_expiry));
    setWholesaleLicenseNumber(String(p.dmre_license_number ?? p.wholesale_license_number ?? ""));
    setWholesaleLicenseIssueDate(profileDateYmd(p.wholesale_license_issue_date));
    setWholesaleLicenseExpiryDate(profileDateYmd(p.dmre_license_expiry ?? p.wholesale_license_expiry_date));
    const savedFuelTypes = Array.isArray(p.allowed_fuel_types)
      ? p.allowed_fuel_types
      : p.allowed_fuel_types
        ? [p.allowed_fuel_types]
        : [];
    setAllowedFuelTypes(
      savedFuelTypes
        .map((saved) => {
          const value = String(saved).trim().toLowerCase();
          return fuelTypesQuery.data?.find(
            (fuelType) =>
              fuelType.code.toLowerCase() === value || fuelType.label.toLowerCase() === value,
          )?.code;
        })
        .filter((code): code is string => Boolean(code)),
    );
    setSiteLicenseNumber(String(p.site_license_number ?? ""));
    setDepotAddress(String(p.depot_address ?? ""));
    setEnvironmentalAuthNumber(String(p.environmental_auth_number ?? ""));
    setApprovedStorageCapacity(String(p.approved_storage_capacity_litres ?? ""));
    setFireCertificateNumber(String(p.fire_certificate_number ?? ""));
    setFireCertificateIssueDate(profileDateYmd(p.fire_certificate_issue_date));
    setFireCertificateExpiryDate(profileDateYmd(p.fire_certificate_expiry_date));
    setHseFileVerified(Boolean(p.hse_file_verified));
    setHseFileLastUpdated(profileDateYmd(p.hse_file_last_updated));
    setSpillComplianceConfirmed(Boolean(p.spill_compliance_confirmed));
    setSabsCertificateNumber(String(p.sabs_certificate_number ?? ""));
    setSabsCertificateIssueDate(profileDateYmd(p.sabs_certificate_issue_date));
    setSabsCertificateExpiryDate(profileDateYmd(p.sabs_certificate_expiry_date));
    setCalibrationCertificateNumber(String(p.calibration_certificate_number ?? ""));
    setCalibrationCertificateIssueDate(profileDateYmd(p.calibration_certificate_issue_date));
    setCalibrationCertificateExpiryDate(profileDateYmd(p.calibration_certificate_expiry_date));
    setPublicLiabilityPolicyNumber(String(p.public_liability_policy_number ?? ""));
    setPublicLiabilityProvider(String(p.public_liability_insurance_provider ?? ""));
    setPublicLiabilityCoverage(String(p.public_liability_coverage_amount_rands ?? ""));
    setPublicLiabilityPolicyExpiryDate(profileDateYmd(p.public_liability_policy_expiry_date));
    setBankAccountName(String(p.bank_account_name ?? ""));
    setBankName(String(p.bank_name ?? ""));
    setAccountNumber(String(p.account_number ?? ""));
    setBranchCode(String(p.branch_code ?? ""));
  }, [profileQuery.data, fuelTypesQuery.data]);

  const docsQuery = useQuery({
    queryKey: ["/api/supplier/documents"],
    queryFn: async () => (await apiClient.get<SupplierDocument[]>("/api/supplier/documents")).data ?? [],
    refetchInterval: 8_000,
  });

  const kybReadinessQuery = useQuery({
    queryKey: ["/api/supplier/compliance/kyb-readiness"],
    queryFn: async () => (await apiClient.get<KybReadiness>("/api/supplier/compliance/kyb-readiness")).data,
    refetchInterval: 8_000,
  });

  const buildCompliancePayload = () => ({
    company_name: companyName.trim() || null,
    registration_number: registrationNumber.trim() || null,
    registered_address: registeredAddress.trim() || null,
    director_names: textToDirectorNames(directorNames),
    vat_number: vatNumber.trim() || null,
    vat_certificate_expiry: vatCertificateExpiry.trim() || null,
    tax_clearance_number: taxClearanceNumber.trim() || null,
    tax_clearance_expiry: taxClearanceExpiry.trim() || null,
    wholesale_license_number: wholesaleLicenseNumber.trim() || null,
    wholesale_license_issue_date: wholesaleLicenseIssueDate.trim() || null,
    wholesale_license_expiry_date: wholesaleLicenseExpiryDate.trim() || null,
    allowed_fuel_types: allowedFuelTypes,
    site_license_number: siteLicenseNumber.trim() || null,
    depot_address: depotAddress.trim() || null,
    environmental_auth_number: environmentalAuthNumber.trim() || null,
    approved_storage_capacity_litres: approvedStorageCapacity.trim() || null,
    fire_certificate_number: fireCertificateNumber.trim() || null,
    fire_certificate_issue_date: fireCertificateIssueDate.trim() || null,
    fire_certificate_expiry_date: fireCertificateExpiryDate.trim() || null,
    hse_file_verified: hseFileVerified,
    hse_file_last_updated: hseFileLastUpdated.trim() || null,
    spill_compliance_confirmed: spillComplianceConfirmed,
    sabs_certificate_number: sabsCertificateNumber.trim() || null,
    sabs_certificate_issue_date: sabsCertificateIssueDate.trim() || null,
    sabs_certificate_expiry_date: sabsCertificateExpiryDate.trim() || null,
    calibration_certificate_number: calibrationCertificateNumber.trim() || null,
    calibration_certificate_issue_date: calibrationCertificateIssueDate.trim() || null,
    calibration_certificate_expiry_date: calibrationCertificateExpiryDate.trim() || null,
    public_liability_policy_number: publicLiabilityPolicyNumber.trim() || null,
    public_liability_insurance_provider: publicLiabilityProvider.trim() || null,
    public_liability_coverage_amount_rands: publicLiabilityCoverage.trim() || null,
    public_liability_policy_expiry_date: publicLiabilityPolicyExpiryDate.trim() || null,
    bank_account_name: bankAccountName.trim() || null,
    bank_name: bankName.trim() || null,
    account_number: accountNumber.trim() || null,
    branch_code: branchCode.trim() || null,
  });

  const saveComplianceMutation = useMutation({
    mutationFn: async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      const res = await apiClient.put<Record<string, unknown>>("/api/supplier/compliance", buildCompliancePayload());
      const data = res.data;
      if (!data || typeof data !== "object") {
        throw new Error("Save unclear — reload this screen to confirm your details were saved.");
      }
      if ("message" in data && data.message === "No fields to update") {
        // Already persisted — OK when submitting.
        return { data, silent, noChanges: true as const };
      }
      const apiErr =
        "error" in data && typeof data.error === "string" && data.error.trim().length > 0
          ? String(data.error).trim()
          : null;
      if (apiErr) {
        throw new Error(apiErr);
      }
      return { data, silent, noChanges: false as const };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/kyb-readiness"] });
      if (result.silent) return;
      if (result.noChanges) {
        Alert.alert("Nothing was saved", "Fill in at least one field and try again.");
        return;
      }
      Alert.alert("Saved", "Your compliance draft was saved. Submit KYB when your checklist is complete.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      Alert.alert(
        "Save failed",
        ax.response?.data?.error || ax.message || "Could not save compliance information.",
      );
    },
  });

  const submitKybMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<Record<string, unknown>>("/api/supplier/compliance/submit-kyb");
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/kyb-readiness"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/documents"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      Alert.alert("KYB submitted", "Your package was sent for admin review.");
    },
    onError: (err: unknown) => {
      const ax = err as {
        response?: {
          data?: {
            error?: string;
            missing_docs?: string[];
            missing_fields?: string[];
            missingDocs?: string[];
            missingFields?: string[];
          };
        };
      };
      const d = ax.response?.data;
      const parts: string[] = [typeof d?.error === "string" ? d.error : "Could not submit KYB."];
      const md = d?.missing_docs ?? d?.missingDocs;
      const mf = d?.missing_fields ?? d?.missingFields;
      if (Array.isArray(md) && md.length) parts.push(`Missing documents: ${md.join(", ")}`);
      if (Array.isArray(mf) && mf.length) parts.push(`Missing fields: ${mf.join(", ")}`);
      Alert.alert("Submit KYB", parts.join("\n\n"));
    },
  });

  const uploadDoc = async (docType: string, title: string) => {
    setUploadingType(docType);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const file = picked.assets[0];
      const mime = (file.mimeType || "").toLowerCase().split(";")[0].trim();
      const name = (file.name || "").toLowerCase();
      if (!isCompliancePdfUpload(mime, name)) {
        Alert.alert("PDF only", compliancePdfOnlyError());
        return;
      }
      const uploadMeta = (await apiClient.post("/api/objects/upload")).data as { uploadURL: string };
      const blob = await (await fetch(file.uri)).blob();
      const uploaded = await putFileToUploadUrl(uploadMeta.uploadURL, blob, "application/pdf");
      if (!uploaded.ok) throw new Error("Upload failed");
      const storedRelativePath = await readUploadObjectPath(uploaded, uploadMeta.uploadURL);
      const aclRes = await apiClient.put("/api/documents", { documentURL: storedRelativePath });
      const objectPath = (aclRes.data as { objectPath?: string }).objectPath || storedRelativePath;
      if (!objectPath) throw new Error("Could not resolve uploaded file path");
      await apiClient.post("/api/supplier/documents", {
        owner_type: "supplier",
        doc_type: docType,
        title,
        file_path: objectPath,
        mime_type: COMPLIANCE_DOCUMENT_MIME,
        file_size: file.size || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/documents"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/kyb-readiness"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
    } catch (e) {
      Alert.alert("Upload failed", (e as Error)?.message || "Could not upload document.");
    } finally {
      setUploadingType(null);
    }
  };

  const downloadDoc = async (doc?: SupplierDocument) => {
    if (!doc?.file_path) return;
    setDownloadingDocType(doc.doc_type);
    Alert.alert("Downloading", "Please wait while the document is being downloaded.");
    try {
      await downloadStoredDocument(
        doc.file_path,
        complianceDocumentDownloadMeta({
          title: doc.title,
          mime_type: doc.mime_type ?? COMPLIANCE_DOCUMENT_MIME,
        }),
      );
      Alert.alert("Download complete", "Your document is ready. Use the menu to save it to your device.");
    } catch (e) {
      Alert.alert(
        "Download failed",
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          (e as Error)?.message ||
          "Check your connection and try again.",
      );
    } finally {
      setDownloadingDocType(null);
    }
  };

  const docProgress = useMemo(() => {
    let approved = 0;
    for (const def of KYB_REQUIRED_DOC_TYPES) {
      const uploaded = (docsQuery.data ?? []).find((row) => row.doc_type === def.docType);
      const st = (uploaded?.verification_status || "pending").toLowerCase();
      if (st === "verified" || st === "approved") approved += 1;
    }
    return { approved, total: KYB_REQUIRED_DOC_TYPES.length };
  }, [docsQuery.data]);

  const progressPct = docProgress.total > 0 ? Math.round((docProgress.approved / docProgress.total) * 100) : 0;

  /** Client-side gate matching server KYB submit rules (company + banking + required docs). */
  const localMissing = useMemo(() => {
    const missingFields: string[] = [];
    if (!nonempty(companyName)) missingFields.push("Registered company name");
    if (!nonempty(registrationNumber)) missingFields.push("CIPC / registration number");
    if (!nonempty(bankAccountName)) missingFields.push("Account holder name");
    if (!nonempty(bankName)) missingFields.push("Bank name");
    if (!nonempty(accountNumber)) missingFields.push("Account number");
    if (!nonempty(branchCode)) missingFields.push("Branch code");

    const missingDocs: string[] = [];
    for (const def of KYB_REQUIRED_DOC_TYPES) {
      const uploaded = (docsQuery.data ?? []).find((row) => row.doc_type === def.docType);
      if (!isDocSatisfying(uploaded?.verification_status)) {
        missingDocs.push(def.title);
      }
    }
    return { missingFields, missingDocs, isComplete: missingFields.length === 0 && missingDocs.length === 0 };
  }, [
    companyName,
    registrationNumber,
    bankAccountName,
    bankName,
    accountNumber,
    branchCode,
    docsQuery.data,
  ]);

  const handleSubmitKyb = async () => {
    if (!localMissing.isComplete) {
      const bits: string[] = [];
      if (localMissing.missingFields.length) {
        bits.push(`Missing fields:\n• ${localMissing.missingFields.join("\n• ")}`);
      }
      if (localMissing.missingDocs.length) {
        bits.push(`Missing documents:\n• ${localMissing.missingDocs.join("\n• ")}`);
      }
      Alert.alert("Cannot submit KYB", bits.join("\n\n") || "Complete all required items marked with *.");
      return;
    }
    try {
      // Persist latest form values so server readiness matches what the user sees.
      await saveComplianceMutation.mutateAsync({ silent: true });
      await submitKybMutation.mutateAsync();
    } catch {
      // Errors surfaced via mutation onError handlers.
    }
  };

  const getKybYmd = (key: KybDateKey): string => {
    switch (key) {
      case "vatExpiry":
        return vatCertificateExpiry;
      case "taxExpiry":
        return taxClearanceExpiry;
      case "wholesaleIssue":
        return wholesaleLicenseIssueDate;
      case "wholesaleExpiry":
        return wholesaleLicenseExpiryDate;
      case "fireIssue":
        return fireCertificateIssueDate;
      case "fireExpiry":
        return fireCertificateExpiryDate;
      case "hseUpdated":
        return hseFileLastUpdated;
      case "sabsIssue":
        return sabsCertificateIssueDate;
      case "sabsExpiry":
        return sabsCertificateExpiryDate;
      case "calibrationIssue":
        return calibrationCertificateIssueDate;
      case "calibrationExpiry":
        return calibrationCertificateExpiryDate;
      case "liabilityExpiry":
        return publicLiabilityPolicyExpiryDate;
    }
  };

  const setKybYmd = (key: KybDateKey, ymd: string) => {
    switch (key) {
      case "vatExpiry":
        setVatCertificateExpiry(ymd);
        break;
      case "taxExpiry":
        setTaxClearanceExpiry(ymd);
        break;
      case "wholesaleIssue":
        setWholesaleLicenseIssueDate(ymd);
        break;
      case "wholesaleExpiry":
        setWholesaleLicenseExpiryDate(ymd);
        break;
      case "fireIssue":
        setFireCertificateIssueDate(ymd);
        break;
      case "fireExpiry":
        setFireCertificateExpiryDate(ymd);
        break;
      case "hseUpdated":
        setHseFileLastUpdated(ymd);
        break;
      case "sabsIssue":
        setSabsCertificateIssueDate(ymd);
        break;
      case "sabsExpiry":
        setSabsCertificateExpiryDate(ymd);
        break;
      case "calibrationIssue":
        setCalibrationCertificateIssueDate(ymd);
        break;
      case "calibrationExpiry":
        setCalibrationCertificateExpiryDate(ymd);
        break;
      case "liabilityExpiry":
        setPublicLiabilityPolicyExpiryDate(ymd);
        break;
    }
  };

  const openKybDatePicker = (key: KybDateKey) => {
    const cur = getKybYmd(key);
    const base = cur && /^\d{4}-\d{2}-\d{2}$/.test(cur) ? parseYmdToLocalDate(cur) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "dismissed" || !date) return;
          setKybYmd(key, formatLocalDateToYmd(date));
        },
      });
      return;
    }
    setIosPickerDraft(base);
    setIosDateKey(key);
  };

  const kybDateRow = (key: KybDateKey, label: string, required = false) => {
    const value = getKybYmd(key);
    const display =
      value && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseYmdToLocalDate(value).toLocaleDateString("en-ZA", { dateStyle: "medium" })
        : "Select date";
    return (
      <View key={key} style={styles.kycDateRow}>
        <Text variant="labelLarge" style={styles.kycDateLabel}>
          {label}
          {required ? <Text style={{ color: "#DC2626", fontWeight: "700" }}> *</Text> : null}
        </Text>
        <Button mode="outlined" onPress={() => openKybDatePicker(key)} style={styles.input} contentStyle={styles.kycDateButtonContent}>
          {display}
        </Button>
      </View>
    );
  };

  const kycFormCard = (children: ReactNode) => (
    <Card style={[styles.card, styles.kycFormCard]} mode="contained">
      <Card.Content style={styles.kycFormCardContent}>{children}</Card.Content>
    </Card>
  );

  const saveDraftBtn = (
    <Button
      mode="contained"
      compact
      buttonColor={theme.colors.primary}
      textColor={theme.colors.onPrimary}
      style={styles.kycPrimaryButton}
      onPress={() => saveComplianceMutation.mutate()}
      loading={saveComplianceMutation.isPending}
    >
      Save draft
    </Button>
  );

  const kycDoc = (docType: string, title: string, label?: string) => (
    <KycInlineDocumentRow
      label={label}
      docType={docType}
      title={title}
      documents={docsQuery.data}
      uploading={uploadingType === docType}
      downloading={downloadingDocType === docType}
      onUpload={uploadDoc}
      onDownload={downloadDoc}
    />
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.kycScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching || docsQuery.isRefetching || kybReadinessQuery.isRefetching}
            onRefresh={() => {
              void profileQuery.refetch();
              void docsQuery.refetch();
              void kybReadinessQuery.refetch();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.kycHero}>
          <View style={styles.kycHeroTopRow}>
            <View style={[styles.kycHeroIconWrap, { backgroundColor: isDark ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.22)" }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={26} color={theme.colors.primary} />
            </View>
            <View style={styles.kycHeroTextCol}>
              <Text variant="headlineSmall" style={styles.kycHeroTitle}>
                Verification & KYB
              </Text>
              <Text variant="bodyMedium" style={styles.kycHeroSubtitle}>
                Save your details and upload documents as drafts. Admins are notified only after you submit your full KYB package.
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
              <View style={[styles.kycProgressFill, { width: `${progressPct}%` as `${number}%`, backgroundColor: theme.colors.primary }]} />
            </View>
          </View>

          {kybReadinessQuery.data ? (
            <View style={[styles.kycStatusBanner, { borderColor: theme.colors.outline, backgroundColor: isDark ? "rgba(30, 41, 59, 0.55)" : "rgba(241, 245, 249, 0.95)" }]}>
              {(() => {
                const r = kybReadinessQuery.data!;
                const pkg = r.package_submitted_at ?? r.packageSubmittedAt;
                const overall = r.overall_status ?? r.overallStatus ?? "";
                if (overall === "approved") {
                  return (
                    <>
                      <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: "700" }}>
                        KYB approved
                      </Text>
                      <Text variant="bodySmall" style={styles.kycBlockHint}>
                        You are verified on the platform.
                      </Text>
                    </>
                  );
                }
                if (pkg && overall === "pending") {
                  return (
                    <>
                      <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: "700" }}>
                        Submitted for review
                      </Text>
                      <Text variant="bodySmall" style={styles.kycBlockHint}>
                        Awaiting admin. You cannot edit your package until it is approved or rejected.
                      </Text>
                    </>
                  );
                }
                return (
                  <>
                    <Text variant="titleSmall" style={{ fontWeight: "700", color: theme.colors.onSurface }}>
                      Draft
                    </Text>
                    <Text variant="bodySmall" style={styles.kycBlockHint}>
                      Complete required fields and documents, then tap Submit KYB at the bottom.
                    </Text>
                  </>
                );
              })()}
            </View>
          ) : kybReadinessQuery.isLoading ? (
            <View style={styles.kycStatusBanner}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : null}
        </View>

        <Text variant="titleMedium" style={styles.kycBlockTitle}>
          Your details
        </Text>
        <Text variant="bodySmall" style={styles.kycBlockHint}>
          Fields marked with a red * are required to submit KYB. Save drafts as you go, then submit when everything required is complete.
        </Text>

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section A</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Banking details
            </Text>
            <Text variant="bodySmall" style={[styles.kycBlockHint, { marginBottom: 10 }]}>
              Required to submit KYB and to accept driver depot orders (payouts).
            </Text>
            <TextInput mode="outlined" label={reqLabel("Account holder name")} value={bankAccountName} onChangeText={setBankAccountName} style={styles.input} />
            <TextInput mode="outlined" label={reqLabel("Bank name")} value={bankName} onChangeText={setBankName} style={styles.input} />
            <TextInput mode="outlined" label={reqLabel("Account number")} value={accountNumber} onChangeText={setAccountNumber} style={styles.input} keyboardType="number-pad" />
            <TextInput mode="outlined" label={reqLabel("Branch code")} value={branchCode} onChangeText={setBranchCode} style={styles.input} keyboardType="number-pad" />
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section B</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Company registration
            </Text>
            <TextInput mode="outlined" label={reqLabel("Registered company name")} value={companyName} onChangeText={setCompanyName} style={styles.input} />
            <TextInput mode="outlined" label={reqLabel("CIPC / registration number")} value={registrationNumber} onChangeText={setRegistrationNumber} style={styles.input} />
            <TextInput mode="outlined" label="Registered address" value={registeredAddress} onChangeText={setRegisteredAddress} style={styles.input} />
            <TextInput mode="outlined" label="Director names (comma-separated)" value={directorNames} onChangeText={setDirectorNames} style={styles.input} />
            {kycDoc("cipc_certificate", "CIPC Certificate", "CIPC certificate upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section C</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              VAT certificate
            </Text>
            <TextInput mode="outlined" label="VAT number" value={vatNumber} onChangeText={setVatNumber} style={styles.input} />
            {kybDateRow("vatExpiry", "VAT certificate expiry")}
            {kycDoc("vat_certificate", "VAT Certificate", "VAT certificate upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section D</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              SARS tax clearance
            </Text>
            <TextInput mode="outlined" label="Tax clearance number" value={taxClearanceNumber} onChangeText={setTaxClearanceNumber} style={styles.input} />
            {kybDateRow("taxExpiry", "Tax clearance expiry")}
            {kycDoc("tax_clearance", "SARS Tax Clearance Certificate", "Tax clearance upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section E</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              DMRE wholesale fuel licence
            </Text>
            <TextInput mode="outlined" label="Licence number" value={wholesaleLicenseNumber} onChangeText={setWholesaleLicenseNumber} style={styles.input} />
            {kybDateRow("wholesaleIssue", "Issue date")}
            {kybDateRow("wholesaleExpiry", "Expiry date")}
            <Text variant="labelLarge" style={styles.kycDateLabel}>Allowed fuel types</Text>
            {(fuelTypesQuery.data ?? []).map((fuelType) => (
              <View key={fuelType.id} style={[styles.rowBetween, styles.kycSwitchRow]}>
                <Text>{fuelType.label}</Text>
                <Switch
                  value={allowedFuelTypes.includes(fuelType.code)}
                  onValueChange={(enabled) =>
                    setAllowedFuelTypes((current) =>
                      enabled
                        ? Array.from(new Set([...current, fuelType.code]))
                        : current.filter((code) => code !== fuelType.code),
                    )
                  }
                />
              </View>
            ))}
            {kycDoc("dmre_license", "DMRE Wholesale Fuel License", "DMRE licence upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section F</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Site licence
            </Text>
            <TextInput mode="outlined" label="Site licence number" value={siteLicenseNumber} onChangeText={setSiteLicenseNumber} style={styles.input} />
            <TextInput mode="outlined" label="Depot address" value={depotAddress} onChangeText={setDepotAddress} style={styles.input} />
            {kycDoc("site_license", "Site License", "Site licence upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section G</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Environmental authorisation
            </Text>
            <TextInput mode="outlined" label="Authorisation number" value={environmentalAuthNumber} onChangeText={setEnvironmentalAuthNumber} style={styles.input} />
            <TextInput mode="outlined" label="Approved storage capacity (litres)" value={approvedStorageCapacity} onChangeText={setApprovedStorageCapacity} keyboardType="numeric" style={styles.input} />
            {kycDoc("environmental_authorisation", "Environmental Authorisation", "Environmental authorisation upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section H</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Fire department certificate
            </Text>
            <TextInput mode="outlined" label="Certificate number" value={fireCertificateNumber} onChangeText={setFireCertificateNumber} style={styles.input} />
            {kybDateRow("fireIssue", "Issue date")}
            {kybDateRow("fireExpiry", "Expiry date")}
            {kycDoc("fire_certificate", "Fire Department Certificate", "Fire certificate upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section I</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Health, safety & spill compliance
            </Text>
            <View style={[styles.rowBetween, styles.kycSwitchRow]}>
              <Text variant="bodyLarge">HSE file verified</Text>
              <Switch value={hseFileVerified} onValueChange={setHseFileVerified} />
            </View>
            {kybDateRow("hseUpdated", "HSE file last updated")}
            <View style={[styles.rowBetween, styles.kycSwitchRow]}>
              <Text variant="bodyLarge">Spill compliance confirmed</Text>
              <Switch value={spillComplianceConfirmed} onValueChange={setSpillComplianceConfirmed} />
            </View>
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section J</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              SABS & calibration
            </Text>
            <TextInput mode="outlined" label="SABS certificate number" value={sabsCertificateNumber} onChangeText={setSabsCertificateNumber} style={styles.input} />
            {kybDateRow("sabsIssue", "SABS issue date")}
            {kybDateRow("sabsExpiry", "SABS expiry date")}
            <TextInput mode="outlined" label="Calibration certificate number" value={calibrationCertificateNumber} onChangeText={setCalibrationCertificateNumber} style={styles.input} />
            {kybDateRow("calibrationIssue", "Calibration issue date")}
            {kybDateRow("calibrationExpiry", "Calibration expiry date")}
            {kycDoc("sabs_certificate", "SABS Fuel Quality Certificate", "SABS certificate upload")}
            {kycDoc("calibration_certificate", "Pump/Meter Calibration Certificate", "Calibration certificate upload")}
            {saveDraftBtn}
          </>,
        )}

        {kycFormCard(
          <>
            <Text style={styles.kycSectionLetter}>Section K</Text>
            <Text variant="titleMedium" style={styles.kycSectionTitle}>
              Public liability insurance
            </Text>
            <TextInput mode="outlined" label="Policy number" value={publicLiabilityPolicyNumber} onChangeText={setPublicLiabilityPolicyNumber} style={styles.input} />
            <TextInput mode="outlined" label="Insurance provider" value={publicLiabilityProvider} onChangeText={setPublicLiabilityProvider} style={styles.input} />
            <TextInput mode="outlined" label="Coverage amount (ZAR)" value={publicLiabilityCoverage} onChangeText={setPublicLiabilityCoverage} keyboardType="numeric" style={styles.input} />
            {kybDateRow("liabilityExpiry", "Policy expiry date")}
            {kycDoc("public_liability_insurance", "Public Liability Insurance", "Insurance certificate upload")}
            {saveDraftBtn}
          </>,
        )}

        {(() => {
          const r = kybReadinessQuery.data;
          const pkg = r?.package_submitted_at ?? r?.packageSubmittedAt;
          const overall = r?.overall_status ?? r?.overallStatus ?? "";
          const awaiting = Boolean(pkg && overall === "pending");
          const canSubmitLocal = localMissing.isComplete && !awaiting && overall !== "approved";
          const hint = awaiting
            ? "Your package is awaiting admin review."
            : overall === "approved"
              ? "Your KYB is approved."
              : !localMissing.isComplete
                ? (() => {
                    const bits: string[] = [];
                    if (localMissing.missingFields.length) {
                      bits.push(`Missing fields: ${localMissing.missingFields.join(", ")}`);
                    }
                    if (localMissing.missingDocs.length) {
                      bits.push(`Missing documents: ${localMissing.missingDocs.join(", ")}`);
                    }
                    return bits.join("\n") || "Complete all required items marked with * to enable Submit KYB.";
                  })()
                : "All required fields and documents look complete. You can submit KYB for review.";
          return (
            <Card style={[styles.card, { marginTop: 8, marginBottom: 24 }]} mode="contained">
              <Card.Content>
                <Text variant="titleSmall" style={{ fontWeight: "700", marginBottom: 6 }}>
                  Submit for review
                </Text>
                <Text variant="bodySmall" style={[styles.kycBlockHint, { marginBottom: 12 }]}>
                  {hint}
                </Text>
                <View style={styles.kycSubmitFooterRow}>
                  <Button
                    mode="outlined"
                    style={{ flex: 1 }}
                    onPress={() => saveComplianceMutation.mutate()}
                    loading={saveComplianceMutation.isPending}
                    disabled={saveComplianceMutation.isPending || awaiting}
                  >
                    Save draft
                  </Button>
                  <Button
                    mode="contained"
                    style={{ flex: 1 }}
                    buttonColor={theme.colors.primary}
                    textColor={theme.colors.onPrimary}
                    loading={submitKybMutation.isPending || saveComplianceMutation.isPending}
                    disabled={
                      submitKybMutation.isPending ||
                      saveComplianceMutation.isPending ||
                      kybReadinessQuery.isLoading ||
                      !canSubmitLocal
                    }
                    onPress={() => {
                      void handleSubmitKyb();
                    }}
                  >
                    Submit KYB
                  </Button>
                </View>
              </Card.Content>
            </Card>
          );
        })()}
      </ScrollView>

      <IosDatePickerSheet
        visible={Platform.OS === "ios" && iosDateKey != null}
        value={iosPickerDraft}
        title={iosDateKey ? "Select date" : undefined}
        onChange={setIosPickerDraft}
        onCancel={() => setIosDateKey(null)}
        onConfirm={() => {
          if (iosDateKey) setKybYmd(iosDateKey, formatLocalDateToYmd(iosPickerDraft));
          setIosDateKey(null);
        }}
      />
    </>
  );
}

function getStyles(theme: typeof lightTheme) {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    kycScrollContent: p.screenScrollContent,
    card: p.sectionCard,
    input: p.input,
    rowBetween: p.rowBetween,
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
    kycProgressTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceVariant, overflow: "hidden" },
    kycProgressFill: { height: 8, borderRadius: 4 },
    kycStatusBanner: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
    kycBlockTitle: { ...p.blockTitle, marginTop: 6 },
    kycBlockHint: p.blockHint,
    kycFormCard: p.sectionCard,
    kycFormCardContent: { paddingVertical: 8 },
    kycSectionLetter: p.sectionKicker,
    kycSectionTitle: { marginBottom: 10, fontWeight: "600", color: theme.colors.onSurface },
    kycDateRow: { marginBottom: 8, width: "100%" },
    kycDateLabel: { marginBottom: 6, color: theme.colors.onSurfaceVariant },
    kycDateButtonContent: { justifyContent: "flex-start" },
    kycSwitchRow: { marginBottom: 8, paddingVertical: 4 },
    kycPrimaryButton: { marginTop: 12, alignSelf: "flex-start", borderRadius: buttonBorderRadius },
    kycSubmitFooterRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  });
}
