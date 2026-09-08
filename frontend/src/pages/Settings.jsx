import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { LoadingRows } from "../components/StateViews";

const FIELD_GROUPS = [
  {
    title: "Company Profile",
    description: "Shown on every voucher slip and invoice.",
    fields: [
      ["name", "Company Name"],
      ["gstin", "GSTIN"],
      ["address", "Address"],
      ["phone", "Phone"],
      ["email", "Email"],
    ],
  },
  {
    title: "CA Handoff",
    description: "Where the monthly voucher pack gets emailed.",
    fields: [["ca_email", "CA Email"]],
  },
  {
    title: "Razorpay",
    description: "Optional — enables payment links on invoices.",
    fields: [["razorpay_key_id", "Key ID"], ["razorpay_key_secret", "Key Secret"]],
  },
  {
    title: "SendGrid",
    description: "Optional — enables emailing invoices and voucher packs.",
    fields: [["sendgrid_api_key", "API Key"]],
  },
  {
    title: "MSG91",
    description: "Optional — enables WhatsApp bill delivery.",
    fields: [["msg91_auth_key", "Auth Key"], ["msg91_sender_id", "Sender ID"]],
  },
];

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/company").then((res) => setProfile(res.data.profile));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put("/settings/company", profile);
      setProfile(res.data.profile);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <LoadingRows testId="settings-loading" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company profile and optional integrations.</p>
      </div>

      {FIELD_GROUPS.map((group) => (
        <Card key={group.title} data-testid={`settings-group-${group.title.toLowerCase().replace(/\s+/g, "-")}`}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.fields.map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`settings-${key}`}>{label}</Label>
                <Input
                  data-testid={`settings-${key}-input`}
                  id={`settings-${key}`}
                  value={profile[key] || ""}
                  onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                  type={key.includes("secret") || key.includes("key") ? "password" : "text"}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Separator />
      <Button data-testid="settings-save-button" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
