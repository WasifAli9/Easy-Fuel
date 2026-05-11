export type UserRole = "customer" | "driver" | "supplier" | "company";

export type RootStackParamList = {
  Splash: undefined;
  AuthSignIn: undefined;
  /** Root stack screen for customer role (must differ from tab names inside CustomerNavigator). */
  CustomerRoot: undefined;
  DriverHome: undefined;
  SupplierHome: undefined;
  CompanyHome: undefined;
};
