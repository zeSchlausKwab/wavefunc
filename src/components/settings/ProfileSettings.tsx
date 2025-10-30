import { useNDKCurrentUser, useProfileValue } from "@nostr-dev-kit/react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription } from "../ui/alert";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useForm } from "@tanstack/react-form";

type ProfileFormData = {
  name: string;
  about: string;
  picture: string;
  banner: string;
  website: string;
  nip05: string;
};

const isValidUrl = (url: string): boolean => {
  if (!url) return true; // Empty URLs are valid (optional fields)
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export function ProfileSettings() {
  const currentUser = useNDKCurrentUser();
  const profile = useProfileValue(currentUser);

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
        // Update the user's profile
        currentUser.profile = {
          ...currentUser.profile,
          name: value.name.trim(),
          about: value.about.trim(),
          picture: value.picture.trim(),
          banner: value.banner.trim(),
          website: value.website.trim(),
          nip05: value.nip05.trim(),
        };

        // Publish the profile to Nostr
        await currentUser.publish();

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err: any) {
        console.error("Failed to save profile:", err);
        setSubmitError(err.message || "Failed to save profile. Please try again.");
      }
    },
  });

  const handleImagePreview = (url: string, type: 'picture' | 'banner') => {
    if (!url) {
      if (type === 'picture') setPicturePreview("");
      else setBannerPreview("");
      return;
    }

    // Basic URL validation
    try {
      new URL(url);

      // Check if it's a valid image URL
      const img = new Image();
      img.onload = () => {
        if (type === 'picture') setPicturePreview(url);
        else setBannerPreview(url);
      };
      img.onerror = () => {
        if (type === 'picture') setPicturePreview("");
        else setBannerPreview("");
      };
      img.src = url;
    } catch {
      if (type === 'picture') setPicturePreview("");
      else setBannerPreview("");
    }
  };

  if (!currentUser) {
    return (
      <div className="text-muted-foreground">
        Please log in to edit your profile.
      </div>
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
        {/* Error Alert */}
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="border-green-600 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Profile saved successfully!</AlertDescription>
          </Alert>
        )}

        {/* Profile Picture Section */}
        <div className="flex items-start gap-6">
          <div className="space-y-2">
            <Label>Profile Picture Preview</Label>
            <Avatar className="w-24 h-24">
              <AvatarImage src={picturePreview} />
              <AvatarFallback className="text-2xl">
                {form.state.values.name?.substring(0, 2) || "??"}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 space-y-4">
            {/* Name Field */}
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => {
                  if (!value || value.trim().length === 0) {
                    return "Display name is required";
                  }
                  if (value.length > 50) {
                    return "Display name must be 50 characters or less";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>
                    Display Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Your display name"
                    maxLength={50}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {field.state.value.length}/50 characters
                  </p>
                </div>
              )}
            </form.Field>

            {/* Picture Field */}
            <form.Field
              name="picture"
              validators={{
                onChange: ({ value }) => {
                  if (value && !isValidUrl(value)) {
                    return "Picture URL must be a valid URL";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Picture URL</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      handleImagePreview(e.target.value, 'picture');
                    }}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A URL to your profile picture
                  </p>
                </div>
              )}
            </form.Field>
          </div>
        </div>

        {/* Banner Preview */}
        {bannerPreview && (
          <div className="space-y-2">
            <Label>Banner Preview</Label>
            <div className="w-full h-48 rounded-lg overflow-hidden bg-muted">
              <img
                src={bannerPreview}
                alt="Banner preview"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Banner Field */}
        <form.Field
          name="banner"
          validators={{
            onChange: ({ value }) => {
              if (value && !isValidUrl(value)) {
                return "Banner URL must be a valid URL";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Banner URL</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  handleImagePreview(e.target.value, 'banner');
                }}
                placeholder="https://example.com/banner.jpg"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                A URL to your profile banner image
              </p>
            </div>
          )}
        </form.Field>

        {/* About Field */}
        <form.Field
          name="about"
          validators={{
            onChange: ({ value }) => {
              if (value && value.length > 500) {
                return "About section must be 500 characters or less";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>About</Label>
              <Textarea
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
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {field.state.value.length}/500 characters
              </p>
            </div>
          )}
        </form.Field>

        {/* Website Field */}
        <form.Field
          name="website"
          validators={{
            onChange: ({ value }) => {
              if (value && !isValidUrl(value)) {
                return "Website must be a valid URL";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Website</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://yourwebsite.com"
                type="url"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* NIP-05 Field */}
        <form.Field name="nip05">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>NIP-05 Identifier</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="you@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                Your Nostr verification identifier
              </p>
            </div>
          )}
        </form.Field>

        {/* Public Keys */}
        <div className="space-y-2">
          <Label>Public Key (npub)</Label>
          <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
            {currentUser.npub}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Hex Public Key</Label>
          <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
            {currentUser.pubkey}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <Button type="submit" disabled={!state.canSubmit || state.isSubmitting}>
                {state.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            )}
          </form.Subscribe>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={form.state.isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
