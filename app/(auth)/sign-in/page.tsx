import { LoginScreen } from "@/components/sign-in-screen";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string | string[] | undefined }>;
}) {
  const { created } = await searchParams;

  return <LoginScreen accountCreated={created === "1"} />;
}
