import { PasswordTokenForm } from "../activate/page";

export default function ResetPasswordPage() {
  return <PasswordTokenForm endpoint="/auth/reset-password" title="Redefina sua senha" description="Escolha uma nova senha forte para sua conta APFiscal." />;
}
