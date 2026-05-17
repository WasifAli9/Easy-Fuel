import { UserRole } from "@/navigation/types";
import { canUseBiometrics, authenticateWithBiometrics } from "@/services/biometrics";
import { getCurrentLocation } from "@/services/location";
type CapabilityResult = {
  biometricValidated?: boolean;
  location?: { latitude: number; longitude: number } | null;
};

export async function initializeRoleCapabilities(role: UserRole): Promise<CapabilityResult> {
  const result: CapabilityResult = {};

  const biometricAvailable = await canUseBiometrics();
  if (biometricAvailable) {
    const biometricAuth = await authenticateWithBiometrics();
    result.biometricValidated = biometricAuth.success;
  } else {
    result.biometricValidated = false;
  }

  if (role === "driver" || role === "supplier") {
    result.location = await getCurrentLocation();
  }

  return result;
}
