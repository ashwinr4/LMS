import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import {
  User, Mail, Shield, Building2, MapPin, Calendar, Clock,
  Lock, CheckCircle2, AlertCircle, Camera, Sparkles, RefreshCw,
  ExternalLink, KeyRound, Upload,
} from 'lucide-react';
import { useRef } from 'react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
];

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [profileData, setProfileData] = useState(user || {});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.file?.fileUrl) {
        setAvatar(data.file.fileUrl);
        setSuccessMessage('Photo selected. Click "Save Profile Changes" to persist.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Fetch freshest profile details from server
  useEffect(() => {
    async function loadProfile() {
      setFetching(true);
      try {
        const { data } = await api.get('/auth/profile');
        if (data.user) {
          setProfileData(data.user);
          setName(data.user.name || '');
          setAvatar(data.user.avatar || '');
          updateUser(data.user);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setFetching(false);
      }
    }
    loadProfile();
  }, [updateUser]);

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name || name.trim().length < 2) {
      setErrorMessage('Full Name must be at least 2 characters long.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', {
        name: name.trim(),
        avatar: avatar || null,
      });

      if (data.user) {
        setProfileData(data.user);
        updateUser(data.user);
        setSuccessMessage('Your profile has been updated successfully.');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Profile update failed:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'System Administrator';
      case 'COURSE_CREATOR':
        return 'Course Creator / Instructor';
      case 'MODERATOR':
        return 'Compliance Moderator';
      case 'USER':
      default:
        return 'Enterprise Student';
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border-purple-300 dark:border-purple-800';
      case 'COURSE_CREATOR':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-300 dark:border-blue-800';
      case 'MODERATOR':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-300 dark:border-amber-800';
      case 'USER':
      default:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <PageHeader
        title="Account & Personal Profile"
        description="Manage your enterprise identity details, name, and profile avatar. System permissions and security roles are managed by platform administrators."
      />

      {successMessage && (
        <div className="p-4 rounded-card bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-sm animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-card bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-800 dark:text-red-300 text-sm animate-fade-in">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column: Avatar & Role Summary Card ──────────────── */}
        <div className="space-y-6">
          <div className="p-6 bg-card border border-app rounded-card shadow-sm text-center space-y-4">
            <div className="relative inline-block mx-auto">
              <Avatar
                src={avatar}
                name={name || 'User'}
                size="xl"
                className="ring-4 ring-slate-100 dark:ring-dark-border"
              />
            </div>

            <div>
              <h2 className="text-lg font-bold text-app truncate">{profileData?.name || 'User'}</h2>
              <p className="text-xs text-app-muted font-mono truncate">{profileData?.email}</p>
            </div>

            <div className="pt-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeColor(profileData?.role)}`}>
                <Shield className="h-3.5 w-3.5" />
                <span>{getRoleLabel(profileData?.role)}</span>
              </span>
            </div>

            {/* Avatar Selection Options */}
            <div className="pt-4 border-t border-app space-y-3 text-left">
              <label className="text-xs font-semibold text-app block">
                Select Predefined Avatar
              </label>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {PRESET_AVATARS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatar(preset)}
                    className={`h-9 w-9 rounded-full overflow-hidden border-2 transition-all ${
                      avatar === preset
                        ? 'border-brand-600 ring-2 ring-brand-500/40 scale-105'
                        : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={preset} alt={`Preset ${idx + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAvatar('')}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-elevated border border-app text-app-secondary hover:text-app hover:border-brand-500/50 transition-colors"
                  title="Reset to default Twitter silhouette"
                >
                  Default Silhouette
                </button>
              </div>

              {/* Local File Upload Option */}
              <div className="pt-2">
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  isLoading={uploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  leftIcon={<Upload className="h-3.5 w-3.5" />}
                  className="w-full text-xs"
                >
                  Upload Custom Photo
                </Button>
              </div>

              {/* Custom Image URL Option */}
              <div className="pt-2">
                <Input
                  label="Or Custom Image URL"
                  placeholder="https://example.com/avatar.jpg"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  rightElement={
                    customAvatarUrl ? (
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => {
                          setAvatar(customAvatarUrl.trim());
                          setCustomAvatarUrl('');
                        }}
                      >
                        Apply
                      </Button>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>

          {/* Role Status Explanation Card */}
          <div className="p-5 bg-elevated/60 border border-app rounded-card space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-app">
              <Lock className="h-4 w-4 text-app-muted" />
              <span>Role Permissions Policy</span>
            </div>
            <p className="text-xs text-app-secondary leading-relaxed">
              Your platform access privileges are determined by the <strong>{getRoleLabel(profileData?.role)}</strong> role. Roles are assigned exclusively by platform administrators.
            </p>
            <p className="text-[11px] text-app-muted leading-relaxed">
              When an administrator updates your permissions in the directory, your access refreshes automatically.
            </p>
          </div>
        </div>

        {/* ── Right Column: Identity Details & Edit Form ─────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="p-6 sm:p-8 bg-card border border-app rounded-card shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-app mb-1">Personal & Profile Information</h3>
              <p className="text-xs text-app-secondary">
                You can edit your display name. Institutional and organizational records are read-only.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Editable: Full Name */}
              <div className="sm:col-span-2">
                <Input
                  label="Full Name (Editable)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  leftIcon={<User className="h-4 w-4" />}
                  helperText="This name will appear on all course enrollments, assessments, and issued certificates."
                />
              </div>

              {/* Read-Only: Corporate Email */}
              <div>
                <label className="block text-xs font-semibold text-app mb-1.5 flex items-center justify-between">
                  <span>Corporate Email Address</span>
                  <span className="text-[10px] text-app-muted flex items-center gap-1 font-normal">
                    <Lock className="h-3 w-3" /> Managed by Directory
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={profileData?.email || ''}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-app bg-elevated/80 text-app-secondary text-sm font-mono cursor-not-allowed opacity-90"
                  />
                  <Mail className="h-4 w-4 text-app-muted absolute right-3.5 top-3" />
                </div>
                <p className="text-[11px] text-app-muted mt-1">Primary authentication and alert destination.</p>
              </div>

              {/* Read-Only: Assigned Role */}
              <div>
                <label className="block text-xs font-semibold text-app mb-1.5 flex items-center justify-between">
                  <span>Assigned System Role</span>
                  <span className="text-[10px] text-app-muted flex items-center gap-1 font-normal">
                    <Lock className="h-3 w-3" /> Administrator Only
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={getRoleLabel(profileData?.role)}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-app bg-elevated/80 text-app-secondary text-sm cursor-not-allowed opacity-90 font-medium"
                  />
                  <Shield className="h-4 w-4 text-app-muted absolute right-3.5 top-3" />
                </div>
                <p className="text-[11px] text-app-muted mt-1">Access control scope and administrative tiers.</p>
              </div>

              {/* Read-Only: Department (Only for Staff roles) */}
              {profileData?.role !== 'USER' && (
                <div>
                  <label className="block text-xs font-semibold text-app mb-1.5 flex items-center justify-between">
                    <span>Department</span>
                    <span className="text-[10px] text-app-muted flex items-center gap-1 font-normal">
                      <Lock className="h-3 w-3" /> Fixed
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={profileData?.department || 'General Enterprise'}
                      className="w-full px-3.5 py-2.5 rounded-btn border border-app bg-elevated/80 text-app-secondary text-sm cursor-not-allowed opacity-90"
                    />
                    <Building2 className="h-4 w-4 text-app-muted absolute right-3.5 top-3" />
                  </div>
                </div>
              )}

              {/* Read-Only: Account Status */}
              <div>
                <label className="block text-xs font-semibold text-app mb-1.5 flex items-center justify-between">
                  <span>Account State</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Verified</span>
                </label>
                <div className="px-3.5 py-2.5 rounded-btn border border-app bg-elevated/80 flex items-center justify-between text-sm">
                  <span className="text-app-secondary font-medium">
                    {profileData?.status || 'ACTIVE'}
                  </span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>

              {/* Account Timestamps */}
              <div className="sm:col-span-2 pt-4 border-t border-app grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-app-secondary">
                <div className="flex items-center gap-2 p-3 bg-elevated/40 rounded-btn border border-app">
                  <Calendar className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                  <div>
                    <span className="text-app-muted block text-[10px]">Member Registered</span>
                    <span className="font-semibold text-app">
                      {profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Enterprise Provisioning'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-elevated/40 rounded-btn border border-app">
                  <Clock className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div>
                    <span className="text-app-muted block text-[10px]">Security 2FA Verification</span>
                    <span className="font-semibold text-app">Active (Email OTP Gateway)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-app">
              <Button
                type="submit"
                isLoading={saving}
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-sm"
              >
                Save Profile Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
