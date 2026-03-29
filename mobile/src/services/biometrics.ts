import * as LocalAuthentication from "expo-local-authentication";

export async function canUseBiometrics() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometrics() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Easy Fuel",
    fallbackLabel: "Use passcode",
    cancelLabel: "Cancel",
  });
}
