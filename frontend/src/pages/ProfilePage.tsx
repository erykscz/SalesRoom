import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, Bell, Loader2, CheckCircle, XCircle, Camera, Upload, Phone, Briefcase, Sparkles } from 'lucide-react';

interface NotificationPreferences {
  deal_transferred: boolean;
  deal_won: boolean;
  deal_lost: boolean;
  mention: boolean;
  search_complete: boolean;
  stage_change: boolean;
  health_alert: boolean;
}

const preferenceLabels: Record<keyof NotificationPreferences, { label: string; description: string }> = {
  deal_transferred: { label: 'Deal Transferred', description: 'When a deal is assigned to you' },
  deal_won: { label: 'Deal Won', description: 'When a deal is marked as won' },
  deal_lost: { label: 'Deal Lost', description: 'When a deal is marked as lost' },
  mention: { label: 'Mentions', description: 'When someone mentions you in a note' },
  search_complete: { label: 'Search Complete', description: 'When Intent Scraper search completes' },
  stage_change: { label: 'Stage Change', description: 'When a deal stage changes' },
  health_alert: { label: 'Health Alert', description: 'When a deal health score drops below threshold' }
};

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    deal_transferred: true,
    deal_won: true,
    deal_lost: true,
    mention: true,
    search_complete: true,
    stage_change: true,
    health_alert: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');
  const [savingMasterPrompt, setSavingMasterPrompt] = useState(false);

  useEffect(() => {
    fetchPreferences();
    fetchMasterPrompt();
  }, []);

  const fetchMasterPrompt = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/master-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMasterPrompt(data.masterPrompt || '');
      }
    } catch (err) {
      console.error('Failed to fetch master prompt:', err);
    }
  };

  const handleSaveMasterPrompt = async () => {
    try {
      setSavingMasterPrompt(true);
      setError(null);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/master-prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ masterPrompt: masterPrompt || null })
      });
      if (!response.ok) throw new Error('Failed to save master prompt');
      setSuccess('Instrukcje AI zapisane!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingMasterPrompt(false);
    }
  };

  // Sync phone/jobTitle from user context
  useEffect(() => {
    if (user) {
      setPhone(user.phone || '');
      setJobTitle(user.jobTitle || '');
    }
  }, [user]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(prev => ({ ...prev, ...data.preferences }));
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    // Read file and create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!avatarPreview || !user) return;

    try {
      setUploadingAvatar(true);
      setError(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ avatarUrl: avatarPreview })
      });

      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }

      setSuccess('Avatar updated successfully!');
      setAvatarPreview(null);
      // Refresh user data in context
      if (refreshUser) {
        await refreshUser();
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCancelAvatar = () => {
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setSavingProfile(true);
      setError(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ phone: phone || null, jobTitle: jobTitle || null })
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
      if (refreshUser) {
        await refreshUser();
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ preferences })
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div
                className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={handleAvatarClick}
                title="Click to change avatar"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="w-full h-full rounded-full object-cover" />
                ) : user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-slate-500" />
                )}
              </div>
              <div
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={handleAvatarClick}
              >
                <Camera className="h-5 w-5 text-white" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Upload avatar"
              />
            </div>
            <div className="flex-1">
              <p className="text-lg font-medium">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-sm text-muted-foreground capitalize">Role: {user?.role}</p>
              {avatarPreview && (
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={handleSaveAvatar} disabled={uploadingAvatar}>
                    {uploadingAvatar ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3 mr-1" />
                    )}
                    Save Avatar
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelAvatar} disabled={uploadingAvatar}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Details */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Update your contact information — visible in Sales Room pages you create</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jobTitle" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Job Title
              </Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Account Executive, Sales Manager"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +48 123 456 789"
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Master Prompt / AI Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Instrukcje AI (Master Prompt)
          </CardTitle>
          <CardDescription>
            Kontroluj język, ton i styl generowanych treści. Te instrukcje będą stosowane przy generowaniu sekcji Sales Room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
              placeholder="np. Pisz wszystkie treści w języku polskim. Zachowaj profesjonalny ton. Unikaj żargonu technicznego. Skupiaj się na korzyściach biznesowych."
              rows={4}
              maxLength={2000}
            />
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {masterPrompt.length}/2000 znaków
              </p>
              <Button onClick={handleSaveMasterPrompt} disabled={savingMasterPrompt}>
                {savingMasterPrompt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Zapisz instrukcje
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose which notifications you want to receive</CardDescription>
            </div>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Preferences
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Success/Error Messages */}
          {success && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <CheckCircle className="h-4 w-4" />
              {success}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.keys(preferenceLabels) as Array<keyof NotificationPreferences>).map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{preferenceLabels[key].label}</p>
                    <p className="text-sm text-muted-foreground">{preferenceLabels[key].description}</p>
                  </div>
                  <Button
                    variant={preferences[key] ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggle(key)}
                  >
                    {preferences[key] ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
