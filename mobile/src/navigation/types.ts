export type UserRole = "customer" | "driver" | "supplier" | "company";

export type RootStackParamList = {
  Splash: undefined;
  AuthSignIn: undefined;
  /** Root stack host for customer role (matches `RootNavigator` + notification deep links). */
  CustomerHome: undefined;
  DriverHome: undefined;
  SupplierHome: undefined;
  CompanyHome: undefined;
};
