import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useCurrentAccount, useProfile } from "../../lib/nostr/auth";
import { useWavefuncNostr } from "../../lib/nostr/runtime";

type ProfileFormData = {
  name: string;
  about: string;
  picture: string;
  banner: string;
  website: string;
  nip05: string;
};

const isValidUrl = (url: string): boolean => {
  if (!url) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
      {children}
      {required && <span className="text-red-600 ml-1">*</span>}
    </label>
  );
}

function BrutalInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border-2 border-on-background bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-on-background/30 ${props.className ?? ""}`}
    />
  );
}

function BrutalTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border-2 border-on-background bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-on-background/30 resize-none ${props.className ?? ""}`}
    />
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
      <span className="material-symbols-outlined text-[13px]">error</span>
      {message}
    </p>
  );
}

export function ProfileSettings() {
  const currentUser = useCurrentAccount();
  const profile = useProfile(currentUser);
  const { signAndPublish } = useWavefuncNostr();

  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [picturePreview, setPicturePreview] = useState(profile?.picture || "");
  const [bannerPreview, setBannerPreview] = useState(profile?.banner || "");

  const form = useForm({
    defaultValues: {
      name: profile?.name || "",
      about: profile?.about || "",
      picture: profile?.picture || "",
      banner: profile?.banner || "",
      website: profile?.website || "",
      nip05: profile?.nip05 || "",
    } as ProfileFormData,
    onSubmit: async ({ value }) => {
      if (!currentUser) return;
      setSubmitError(null);
      try {
        await signAndPublish({
          kind: 0,
          tags: [],
          content: JSON.stringify({
            ...(profile ?? {}),
            name: value.name.trim() || undefined,
            displayName: value.name.trim() || undefined,
            about: value.about.trim() || undefined,
            picture: value.picture.trim() || undefined,
            image: value.picture.trim() || undefined,
            banner: value.banner.trim() || undefined,
            website: value.website.trim() || undefined,
            nip05: value.nip05.trim() || undefined,
          }),
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err: any) {
        console.error("Failed to save profile:", err);
        setSubmitError(err.message || "Failed to save profile. Please try again.");
      }
    },
  });

  const handleImagePreview = (url: string, type: "picture" | "banner") => {
    if (!url) {
      if (type === "picture") setPicturePreview("");
      else setBannerPreview("");
      return;
    }
    try {
      new URL(url);
      const img = new Image();
      img.onload = () => {
        if (type === "picture") setPicturePreview(url);
        else setBannerPreview(url);
      };
      img.onerror = () => {
        if (type === "picture") setPicturePreview("");
        else setBannerPreview("");
      };
      img.src = url;
    } catch {
      if (type === "picture") setPicturePreview("");
      else setBannerPreview("");
    }
  };

  if (!currentUser) {
    return (
      <p className="text-sm text-on-background/60">Please log in to edit your profile.</p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="space-y-6">
        {/* Section header */}
        <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
          <span className="material-symbols-outlined text-[20px]">person</span>
          <h3 className="text-base font-black uppercase tracking-tighter">Profile</h3>
        </div>

        {/* Error banner */}
        {submitError && (
          <div className="flex items-start gap-2 border-2 border-red-600 bg-red-50 px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-red-600 shrink-0 mt-0.5">error</span>
            <p className="text-xs font-bold text-red-700">{submitError}</p>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="flex items-start gap-2 border-2 border-green-600 bg-green-50 px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-green-700 shrink-0 mt-0.5">check_circle</span>
            <p className="text-xs font-bold text-green-700">Profile saved successfully!</p>
          </div>
        )}

        {/* Profile picture + name/picture url */}
        <div className="flex items-start gap-5">
          {/* Avatar preview */}
          <div className="space-y-1.5 shrink-0">
            <FieldLabel>Preview</FieldLabel>
            <div className="w-20 h-20 border-4 border-on-background overflow-hidden bg-on-background flex items-center justify-center">
              {picturePreview ? (
                <img
                  src={picturePreview}
                  alt="Profile preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-[32px] text-surface/50">person</span>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {/* Name */}
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => {
                  if (!value || value.trim().length === 0) return "Display name is required";
                  if (value.length > 50) return "Display name must be 50 characters or less";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <FieldLabel required>Display Name</FieldLabel>
                  <BrutalInput
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Your display name"
                    maxLength={50}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError message={String(field.state.meta.errors[0])} />
                  )}
                  <p className="text-[10px] text-on-background/40">
                    {field.state.value.length}/50
                  </p>
                </div>
              )}
            </form.Field>

            {/* Picture URL */}
            <form.Field
              name="picture"
              validators={{
                onChange: ({ value }) => {
                  if (value && !isValidUrl(value)) return "Must be a valid URL";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <FieldLabel>Picture URL</FieldLabel>
                  <BrutalInput
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      handleImagePreview(e.target.value, "picture");
                    }}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError message={String(field.state.meta.errors[0])} />
                  )}
                </div>
              )}
            </form.Field>
          </div>
        </div>

        {/* Banner Preview */}
        {bannerPreview && (
          <div className="space-y-1.5">
            <FieldLabel>Banner Preview</FieldLabel>
            <div className="w-full h-40 border-4 border-on-background overflow-hidden">
              <img
                src={bannerPreview}
                alt="Banner preview"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Banner URL */}
        <form.Field
          name="banner"
          validators={{
            onChange: ({ value }) => {
              if (value && !isValidUrl(value)) return "Must be a valid URL";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <FieldLabel>Banner URL</FieldLabel>
              <BrutalInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  handleImagePreview(e.target.value, "banner");
                }}
                placeholder="https://example.com/banner.jpg"
              />
              {field.state.meta.errors.length > 0 && (
                <FieldError message={String(field.state.meta.errors[0])} />
              )}
            </div>
          )}
        </form.Field>

        {/* About */}
        <form.Field
          name="about"
          validators={{
            onChange: ({ value }) => {
              if (value && value.length > 500) return "About must be 500 characters or less";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <FieldLabel>About</FieldLabel>
              <BrutalTextarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Tell us about yourself"
                rows={4}
                maxLength={500}
              />
              {field.state.meta.errors.length > 0 && (
                <FieldError message={String(field.state.meta.errors[0])} />
              )}
              <p className="text-[10px] text-on-background/40">
                {field.state.value.length}/500
              </p>
            </div>
          )}
        </form.Field>

        {/* Website */}
        <form.Field
          name="website"
          validators={{
            onChange: ({ value }) => {
              if (value && !isValidUrl(value)) return "Must be a valid URL";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <FieldLabel>Website</FieldLabel>
              <BrutalInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://yourwebsite.com"
                type="url"
              />
              {field.state.meta.errors.length > 0 && (
                <FieldError message={String(field.state.meta.errors[0])} />
              )}
            </div>
          )}
        </form.Field>

        {/* NIP-05 */}
        <form.Field name="nip05">
          {(field) => (
            <div className="space-y-1.5">
              <FieldLabel>NIP-05 Identifier</FieldLabel>
              <BrutalInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="you@yourdomain.com"
              />
              <p className="text-[10px] text-on-background/40">
                Your Nostr verification identifier
              </p>
            </div>
          )}
        </form.Field>

        {/* Public keys */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <FieldLabel>Public Key (npub)</FieldLabel>
            <div className="border-2 border-on-background/30 bg-surface-container-low px-3 py-2 font-mono text-xs break-all text-on-background/70">
              {currentUser.npub}
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Hex Public Key</FieldLabel>
            <div className="border-2 border-on-background/30 bg-surface-container-low px-3 py-2 font-mono text-xs break-all text-on-background/70">
              {currentUser.pubkey}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <button
                type="submit"
                disabled={!state.canSubmit || state.isSubmitting}
                className="flex items-center gap-2 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-5 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]"
              >
                {state.isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Save Changes
                  </>
                )}
              </button>
            )}
          </form.Subscribe>
          <button
            type="button"
            onClick={() => form.reset()}
            disabled={form.state.isSubmitting}
            className="border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-5 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>
    </form>
  );
}
