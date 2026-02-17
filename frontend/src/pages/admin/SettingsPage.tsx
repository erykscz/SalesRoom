import { useState, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Settings, Clock, HardDrive, Bell, MessageSquare, Save, TestTube, CheckCircle, XCircle, Download, Database } from 'lucide-react';

interface SystemSettings {
  session_timeout_hours?: { value: string; updatedAt: string };
  max_file_size_mb?: { value: string; updatedAt: string };
  stagnation_warning_days?: { value: string; updatedAt: string };
  stagnation_critical_days?: { value: string; updatedAt: string };
  auto_archive_months?: { value: string; updatedAt: string };
  slack_webhook_url?: { value: string; updatedAt: string };
  slack_notifications_enabled?: { value: string; updatedAt: string };
  email_notifications_enabled?: { value: string; updatedAt: string };
  default_deal_health_threshold?: { value: string; updatedAt: string };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    session_timeout_hours: '4',
    max_file_size_mb: '10',
    stagnation_warning_days: '10',
    stagnation_critical_days: '20',
    auto_archive_months: '12',
    slack_webhook_url: '',
    slack_notifications_enabled: 'false',
    email_notifications_enabled: 'false',
    default_deal_health_threshold: '40'
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data.settings || {});

      // Update form data with existing settings
      const newFormData = { ...formData };
      Object.entries(data.settings || {}).forEach(([key, val]) => {
        if (key in newFormData) {
          newFormData[key as keyof typeof newFormData] = (val as { value: string }).value;
        }
      });
      setFormData(newFormData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ settings: formData })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      const data = await response.json();
      setSettings(data.settings || {});
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSlack = async () => {
    try {
      setTestingSlack(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/settings/test-slack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send test notification');
      }

      setSuccess('Test notification sent to Slack!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setTestingSlack(false);
    }
  };

  const handleInputChange = (key: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleToggle = (key: keyof typeof formData) => {
    setFormData(prev => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true'
    }));
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/export-data`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export data');
      }

      const data = await response.json();

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salesroom-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess('Data exported successfully! Check your downloads folder.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-muted-foreground">Configure system parameters and integrations</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle className="h-5 w-5" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <XCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Session Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Session Settings
          </CardTitle>
          <CardDescription>Configure user session behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="session_timeout">Session Timeout (hours)</Label>
              <Input
                id="session_timeout"
                type="number"
                min="1"
                max="168"
                value={formData.session_timeout_hours}
                onChange={(e) => handleInputChange('session_timeout_hours', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                How long before inactive sessions expire (1-168 hours)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Settings
          </CardTitle>
          <CardDescription>Configure file upload limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_file_size">Max File Size (MB)</Label>
              <Input
                id="max_file_size"
                type="number"
                min="1"
                max="100"
                value={formData.max_file_size_mb}
                onChange={(e) => handleInputChange('max_file_size_mb', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum upload file size in megabytes
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deal Management Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Deal Management
          </CardTitle>
          <CardDescription>Configure deal health and archiving rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stagnation_warning">Stagnation Warning (days)</Label>
              <Input
                id="stagnation_warning"
                type="number"
                min="1"
                max="90"
                value={formData.stagnation_warning_days}
                onChange={(e) => handleInputChange('stagnation_warning_days', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Days before showing stagnation warning
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stagnation_critical">Stagnation Critical (days)</Label>
              <Input
                id="stagnation_critical"
                type="number"
                min="1"
                max="180"
                value={formData.stagnation_critical_days}
                onChange={(e) => handleInputChange('stagnation_critical_days', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Days before critical stagnation alert
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto_archive">Auto-Archive (months)</Label>
              <Input
                id="auto_archive"
                type="number"
                min="1"
                max="60"
                value={formData.auto_archive_months}
                onChange={(e) => handleInputChange('auto_archive_months', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Months before auto-archiving closed deals
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="health_threshold">Default Health Threshold</Label>
              <Input
                id="health_threshold"
                type="number"
                min="1"
                max="100"
                value={formData.default_deal_health_threshold}
                onChange={(e) => handleInputChange('default_deal_health_threshold', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Below this score, deals are flagged as at-risk
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure system notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Send email notifications for important events
              </p>
            </div>
            <Button
              variant={formData.email_notifications_enabled === 'true' ? 'default' : 'outline'}
              onClick={() => handleToggle('email_notifications_enabled')}
            >
              {formData.email_notifications_enabled === 'true' ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Slack Notifications</p>
              <p className="text-sm text-muted-foreground">
                Send notifications to Slack channel
              </p>
            </div>
            <Button
              variant={formData.slack_notifications_enabled === 'true' ? 'default' : 'outline'}
              onClick={() => handleToggle('slack_notifications_enabled')}
            >
              {formData.slack_notifications_enabled === 'true' ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Slack Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Slack Integration
          </CardTitle>
          <CardDescription>Configure Slack webhook for notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slack_webhook">Slack Webhook URL</Label>
            <Input
              id="slack_webhook"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={formData.slack_webhook_url}
              onChange={(e) => handleInputChange('slack_webhook_url', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Create a webhook in your Slack workspace and paste the URL here
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleTestSlack}
              disabled={testingSlack || !formData.slack_webhook_url}
            >
              {testingSlack ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Slack Connection
            </Button>
            <span className="text-sm text-muted-foreground">
              Send a test notification to verify the webhook
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Backup & Export
          </CardTitle>
          <CardDescription>Export all system data for backup or migration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">What's included in the export:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Users (without passwords)</li>
              <li>• Deals and Leads</li>
              <li>• Transcripts</li>
              <li>• Sales Rooms</li>
              <li>• Activities</li>
              <li>• Battlecards</li>
              <li>• Knowledge Base</li>
            </ul>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleExportData} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export All Data
            </Button>
            <span className="text-sm text-muted-foreground">
              Downloads as JSON file
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated Info */}
      {settings.session_timeout_hours?.updatedAt && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Settings last updated: {new Date(settings.session_timeout_hours.updatedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
