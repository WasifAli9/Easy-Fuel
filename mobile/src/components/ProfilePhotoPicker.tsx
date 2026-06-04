import { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/design/paper-button";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { apiClient } from "@/services/api/client";
import { normalizeFilePath, resolveApiUrl } from "@/lib/files";
import { appConfig } from "@/services/config";
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
  const [localPhotoPath, setLocalPhotoPath] = useState<string | null>(null);

  const effectivePhotoPath = localPhotoPath ?? photoUrl ?? null;
  const normalizedPhotoPath = normalizeFilePath(effectivePhotoPath);

  const presignQuery = useQuery({
    queryKey: ["/api/objects/presigned-url", "profile-photo", role, normalizedPhotoPath],
    enabled: Boolean(normalizedPhotoPath),
    staleTime: 0,
    queryFn: async () => {
      const path = normalizedPhotoPath;
      if (!path) throw new Error("Missing photo path");
      const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", {
        objectPath: path,
      });
      const signed = data.signedUrl;
      return signed.startsWith("http") ? signed : resolveApiUrl(appConfig.apiBaseUrl, signed);
    },
  });

  const displayUri = useMemo(() => {
    if (!normalizedPhotoPath) return null;
    if (normalizedPhotoPath.startsWith("http://") || normalizedPhotoPath.startsWith("https://")) {
      return normalizedPhotoPath;
    }
    if (normalizedPhotoPath.startsWith("/objects/")) {
      return presignQuery.data ?? null;
    }
    return resolveApiUrl(appConfig.apiBaseUrl, normalizedPhotoPath);
  }, [normalizedPhotoPath, presignQuery.data]);

  useEffect(() => {
    setLoadFailed(false);
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

  const showSpinner = uploadMutation.isPending || (Boolean(normalizedPhotoPath) && presignQuery.isLoading);

  return (
    <View style={styles.row}>
      <View style={[styles.avatarWrap, { borderColor: theme.colors.outline }]}>
        {showSpinner ? (
          <ActivityIndicator />
        ) : displayUri && !loadFailed ? (
          <Image
            source={{ uri: displayUri }}
            style={styles.avatarImage}
            onError={() => setLoadFailed(true)}
          />
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
      width: 88,
      height: 88,
    },
    actions: {
      flex: 1,
      gap: 6,
    },
    hint: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
  });
