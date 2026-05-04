import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  PROFILE_CONFIGS,
  getRememberAccessPreference,
  getSavedCredentials,
  persistProfileMode,
  persistSavedCredentials,
} from "@/constants/appProfiles";
import { normalizarNome } from "@/utils/faturaState";

export default function LoginPage() {
  const navigate = useNavigate();
  const savedCredentials = getSavedCredentials();
  const [loginUsername, setLoginUsername] = useState(savedCredentials.username);
  const [loginPassword, setLoginPassword] = useState(savedCredentials.password);
  const [rememberAccess, setRememberAccess] = useState(getRememberAccessPreference);

  const entrarComoVisitante = () => {
    persistProfileMode("guest", rememberAccess);
    persistSavedCredentials(loginUsername, loginPassword, rememberAccess);
    toast.success("Entrando como visitante.");
    navigate("/home", { replace: true });
  };

  const entrarComoAntonia = () => {
    const antoniaProfile = PROFILE_CONFIGS.antonia;
    const usernameOk = normalizarNome(loginUsername) === antoniaProfile.username;
    const passwordOk = loginPassword.trim().toLowerCase() === antoniaProfile.password;

    if (!usernameOk || !passwordOk) {
      toast.error("Usuario ou senha invalidos.");
      return;
    }

    persistProfileMode("antonia", rememberAccess);
    persistSavedCredentials(loginUsername, loginPassword, rememberAccess);
    toast.success(rememberAccess ? "Acesso salvo neste navegador." : "Acesso liberado.");
    navigate("/home", { replace: true });
  };

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container flex min-h-screen max-w-5xl flex-col justify-center gap-6 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            Escolha como deseja entrar
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Divida sua fatura <span className="text-orange-500">em segundos.</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Faca upload do PDF da fatura e atribua cada despesa a uma pessoa.
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Acesso local</h2>
                <p className="text-sm text-muted-foreground">Entre com identificador e codigo de acesso.</p>
              </div>
            </div>
            <div className="grid gap-3">
              <Input
                name="local-access-id"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Identificador"
                value={loginUsername}
                onChange={event => setLoginUsername(event.target.value)}
              />
              <Input
                type="password"
                name="local-access-code"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Codigo de acesso"
                value={loginPassword}
                onChange={event => setLoginPassword(event.target.value)}
                onKeyDown={event => event.key === "Enter" && entrarComoAntonia()}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={rememberAccess}
                  onCheckedChange={checked => setRememberAccess(checked === true)}
                />
                Salvar acesso neste navegador
              </label>
              <Button className="w-full" onClick={entrarComoAntonia}>
                Entrar
              </Button>
            </div>
          </Card>

          <Button variant="outline" className="w-full" onClick={entrarComoVisitante}>
            <UserRound className="h-4 w-4" /> Entrar como visitante
          </Button>
        </div>
      </div>
    </div>
  );
}
