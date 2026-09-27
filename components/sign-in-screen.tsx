import { AuthPreviewScreen } from "./auth-preview-screen";

export function LoginScreen({ accountCreated = false }: { accountCreated?: boolean }) {
  return <AuthPreviewScreen accountCreated={accountCreated} mode="login" />;
}
