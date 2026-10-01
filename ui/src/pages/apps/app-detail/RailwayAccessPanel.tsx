import { useEffect, useId, useState } from "react";
import { t } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConfigureRailwaySsh, ConnectionGrantsResponse, RailwaySshSetup, ToolConnection } from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RailwayAccessPanel({ connection, grants }: { connection: ToolConnection; grants?: ConnectionGrantsResponse }) {
  const queryClient = useQueryClient();
  const id = useId();
  const setup = connection.config?.railwaySsh as RailwaySshSetup | null | undefined;
  const owned = (grants?.grants ?? []).filter((grant) => grant.kind !== "user" || grant.subjectUserId === grants?.currentUserId);
  const eligible = owned.filter((grant) => grant.status === "active");
  const [selectedGrant, setSelectedGrant] = useState("");
  const [knownHosts, setKnownHosts] = useState(setup?.knownHosts ?? "");
  useEffect(() => { setKnownHosts(setup?.knownHosts ?? ""); }, [setup?.knownHosts]);
  const grantId = setup?.grantId ?? (selectedGrant || eligible[0]?.id);
  const canConfigure = grants?.capabilities.canConfigure && connection.status === "active" && eligible.some((grant) => grant.id === grantId);
  const canRemove = grants?.capabilities.canConfigure && owned.some((grant) => grant.id === setup?.grantId);
  const mutation = useMutation({
    mutationFn: (input: ConfigureRailwaySsh) => toolsApi.configureRailwaySsh(connection.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connection.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connectionGrants(connection.id) });
    },
  });
  return <section className="space-y-4" aria-labelledby={`${id}-title`}>
    <div className="space-y-2">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("pages.apps.appDetail.railwayAccessPanel.railwayOperations", { defaultValue: "Railway operations" })}</h2>
      <p className="text-sm text-muted-foreground">
        {typeof connection.config?.railwayApiMessage === "string" ? connection.config?.railwayApiMessage : "Refresh actions after connecting to check service, log, and deployment access."}
      </p>
    </div>
    <div className="space-y-2">
      <h3 className="font-medium">{t("pages.apps.appDetail.railwayAccessPanel.containerAccess", { defaultValue: "Container access" })}</h3>
      <p className="text-sm text-muted-foreground">{t("pages.apps.appDetail.railwayAccessPanel.toAllowPaperclipDirectSshAccessToRailwayContaine", { defaultValue: "To allow Paperclip direct SSH access to Railway containers, you can optionally generate an SSH key pair." })} <a className="underline" href="https://docs.railway.com/cli/ssh" target="_blank" rel="noreferrer">{t("pages.apps.appDetail.railwayAccessPanel.railwaySshDocumentation", { defaultValue: "Railway SSH documentation" })}</a></p>
    </div>
    {!canConfigure && <p className="text-sm text-muted-foreground">{t("pages.apps.appDetail.railwayAccessPanel.theConnectionManagerAndAuthorizationOwnerCanConf", { defaultValue: "The connection manager and authorization owner can configure container access." })}</p>}
    {(canConfigure || canRemove) && grantId && <>
      {!setup && eligible.length > 1 && <div className="space-y-2">
        <Label htmlFor={`${id}-grant`}>{t("pages.apps.appDetail.railwayAccessPanel.authorization", { defaultValue: "Authorization" })}</Label>
        <select id={`${id}-grant`} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={grantId} onChange={(event) => setSelectedGrant(event.target.value)}>
          {eligible.map((grant) => <option key={grant.id} value={grant.id}>{grant.kind === "organization" ? "Shared account" : grant.kind === "user" ? "My account" : "Agent account"}</option>)}
        </select>
      </div>}
      {!setup && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "prepare", grantId })}>{t("pages.apps.appDetail.railwayAccessPanel.generateSshKeyPair", { defaultValue: "Generate SSH key pair" })}</Button>}
      {setup && <>
        <div className="space-y-2">
          <Label htmlFor={`${id}-public`}>{t("pages.apps.appDetail.railwayAccessPanel.publicKey", { defaultValue: "Public key" })}</Label>
          <Textarea id={`${id}-public`} readOnly value={setup.publicKey} className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("pages.apps.appDetail.railwayAccessPanel.registerThisPublicKeyInTheRailwayAccountUsedByTh", { defaultValue: "Register this public key in the Railway account used by this authorization. The private key stays in Paperclip’s vault." })} <a className="underline" href="https://docs.railway.com/cli/ssh#manage-ssh-keys" target="_blank" rel="noreferrer">{t("pages.apps.appDetail.railwayAccessPanel.railwayKeySetup", { defaultValue: "Railway key setup" })}</a></p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-host`}>{t("pages.apps.appDetail.railwayAccessPanel.verifiedRailwayHostKey", { defaultValue: "Verified Railway host key" })}</Label>
          <Textarea id={`${id}-host`} value={knownHosts} onChange={(event) => setKnownHosts(event.target.value)} placeholder={t("pages.apps.appDetail.railwayAccessPanel.sshRailwayComSshEd25519", { defaultValue: "ssh.railway.com ssh-ed25519 …" })} className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("pages.apps.appDetail.railwayAccessPanel.pasteTheSshRailwayComLineFromAKnownHostsEntryYou", { defaultValue: "Paste the ssh.railway.com line from a known_hosts entry you have independently verified. Paperclip refuses untrusted or changed host keys." })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canConfigure || mutation.isPending || !knownHosts.trim()} onClick={() => mutation.mutate({ action: "enable", grantId, knownHosts })}>{setup.enabled ? "Update trusted host key" : "Enable container access"}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "remove", grantId })}>{t("pages.apps.appDetail.railwayAccessPanel.removeContainerKey", { defaultValue: "Remove container key" })}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{setup.enabled ? "Container access is enabled for this authorization." : "Register the public key and verify the host key before enabling access."} Removing the key stops new Paperclip connections. Also remove its public key from Railway.</p>
      </>}
    </>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof Error ? mutation.error.message : "Container access could not be updated."}</p>}
  </section>;
}
