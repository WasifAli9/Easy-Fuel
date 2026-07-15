import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/design/paper-button";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { resolveProfilePhotoDisplayUri } from "@/lib/profile-photo-display";
import { pickAndUploadProfilePhoto, type ProfilePhotoRole } from "@/services/profile-photo";

type ProfilePhotoPickerProps = {
  role: ProfilePhotoRole;
  photoUrl?: string | null;
  queryKeysToInvalidate?: string[];
};

export function ProfilePhotoPicker({ role, photoUrl, queryKeysToInvalidate = [] }: ProfilePhotoPickerProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [loadFailed, setLoadFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [localPhotoPath, setLocalPhotoPath] = useState<string | null>(null);

  const effectivePhotoPath = localPhotoPath ?? photoUrl ?? null;

  const displayQuery = useQuery({
    queryKey: ["profile-photo-display", role, effectivePhotoPath],
    enabled: Boolean(effectivePhotoPath),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => resolveProfilePhotoDisplayUri(effectivePhotoPath),
  });

  const displayUri = displayQuery.data ?? null;

  useEffect(() => {
    setLoadFailed(false);
    setImageReady(false);
  }, [displayUri, effectivePhotoPath]);

  const uploadMutation = useMutation({
    mutationFn: () => pickAndUploadProfilePhoto(role),
    onSuccess: async (savedPath) => {
      setLocalPhotoPath(savedPath);
      const keys = [
        "/api/profile",
        "/api/driver/profile",
        "/api/supplier/profile",
        "/api/auth/me",
        ...queryKeysToInvalidate,
      ];
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      await queryClient.invalidateQueries({ queryKey: ["profile-photo-display"] });
      await queryClient.refetchQueries({ queryKey: ["/api/profile"] });
      Alert.alert("Photo updated", "Your profile picture was saved.");
    },
    onError: (error: unknown) => {
      const msg = (error as Error)?.message;
      if (msg === "cancelled") return;
      Alert.alert(
        "Upload failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          msg ||
          "Could not update profile picture.",
      );
    },
  });

  const showSpinner =
    uploadMutation.isPending || (Boolean(effectivePhotoPath) && (displayQuery.isLoading || displayQuery.isFetching));
  const showImage = Boolean(displayUri) && !loadFailed && !displayQuery.isError;

  return (
    <View style={styles.row}>
      <View style={[styles.avatarWrap, { borderColor: theme.colors.outline }]}>
        {showSpinner && !imageReady ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : showImage ? (
          <>
            {!imageReady ? (
              <MaterialCommunityIcons name="account-circle" size={56} color={theme.colors.onSurfaceVariant} />
            ) : null}
            <Image
              source={{ uri: displayUri! }}
              style={[styles.avatarImage, !imageReady ? styles.avatarImageHidden : null]}
              resizeMode="cover"
              onLoad={() => setImageReady(true)}
              onError={() => {
                setLoadFailed(true);
                setImageReady(false);
              }}
            />
          </>
        ) : (
          <MaterialCommunityIcons name="account-circle" size={56} color={theme.colors.onSurfaceVariant} />
        )}
      </View>
      <View style={styles.actions}>
        <Button
          mode="outlined"
          icon="image-outline"
          onPress={() => uploadMutation.mutate()}
          loading={uploadMutation.isPending}
          disabled={uploadMutation.isPending}
        >
          {effectivePhotoPath ? "Change photo" : "Upload photo"}
        </Button>
        <Text style={styles.hint}>JPG or PNG, up to 5 MB</Text>
        {displayQuery.isError && effectivePhotoPath ? (
          <Text style={styles.errorHint}>Could not load photo. Try uploading again.</Text>
        ) : null}
      </View>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginBottom: 16,
    },
    avatarWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceVariant,
    },
    avatarImage: {
      ...StyleSheet.absoluteFillObject,
      width: 88,
      height: 88,
    },
    avatarImageHidden: {
      opacity: 0,
    },
    actions: {
      flex: 1,
      gap: 6,
    },
    hint: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    errorHint: {
      fontSize: 12,
      color: theme.colors.error,
    },
  });
