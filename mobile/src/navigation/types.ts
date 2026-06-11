export type UserRole = "customer" | "driver" | "supplier";

export type RootStackParamList = {
  Splash: undefined;
  AuthSignIn: undefined;
  /** Root stack host for customer role (must differ from tab screen names inside `CustomerNavigator`). */
  CustomerRoot: undefined;
  DriverHome: undefined;
  SupplierHome: undefined;
};
