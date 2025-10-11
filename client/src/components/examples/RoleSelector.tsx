import { RoleSelector } from "../RoleSelector";

export default function RoleSelectorExample() {
  return (
    <RoleSelector 
      onSelectRole={(role) => console.log("Selected role:", role)}
    />
  );
}
