import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';

export const colors = {
  paper: '#FBF9F4',
  cream: '#F8F5EE',
  ink: '#242A23',
  moss: '#2F493B',
  muted: '#596456',
  border: '#DCDDD1',
  clay: '#9B4D36',
  white: '#FFFFFF',
};

const serif = Platform.select({ android: 'serif', default: 'Georgia' });
const imageTypes = ['image/jpeg', 'image/png'];
const maxEvidenceSize = 2 * 1024 * 1024;

export function VisitorScreen({ title, subtitle, onBack, children }) {
  return (
    <SafeAreaView style={styles.safe} edges={onBack ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.safe}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={false}
        >
          <View style={styles.page}>
            {onBack && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={onBack}
                style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-back" size={21} color={colors.ink} />
              </Pressable>
            )}
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Button({ label, onPress, secondary = false, busy = false, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? colors.moss : colors.white} />}
      <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.moss}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...inputProps}
        style={[styles.input, focused && styles.focused, style]}
      />
      {hint && <Text style={styles.note}>{hint}</Text>}
    </View>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{children}</Text>;
}

export function Panel({ icon, title, children }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelIcon}>
        <Ionicons name={icon} size={21} color={colors.moss} />
      </View>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Loading({ label }) {
  return (
    <View style={styles.loading} accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <ActivityIndicator color={colors.moss} />
      <Text style={styles.note}>{label}</Text>
    </View>
  );
}

export function useVisitorList(load, token) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!token) return undefined;
    let active = true;
    setResult({ token, busy: true });
    load(token).then(
      (items) => { if (active) setResult({ token, items }); },
      (error) => { if (active) setResult({ token, error: error.message || 'Please try again.' }); },
    );
    return () => { active = false; };
  }, [load, token, revision]));

  const reload = () => setRevision((previous) => previous + 1);
  const current = token && result?.token === token ? result : { busy: Boolean(token) };
  return { ...current, reload };
}

export function EvidenceField({ label, value, onChange, disabled }) {
  const [error, setError] = useState('');

  async function pickFile() {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: imageTypes,
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      const asset = result.assets?.[0];
      if (!asset) return;

      const extension = asset.name?.match(/\.(png|jpe?g)$/i)?.[1]?.toLowerCase();
      const declaredType = asset.file?.type || asset.mimeType;
      const mimeType = declaredType && declaredType !== 'application/octet-stream'
        ? declaredType
        : extension === 'png' ? 'image/png' : extension ? 'image/jpeg' : '';
      if (!imageTypes.includes(mimeType)) {
        setError('Choose a JPEG or PNG image.');
        return;
      }
      const size = asset.file?.size ?? asset.size;
      if (size !== undefined && (size < 1 || size > maxEvidenceSize)) {
        setError('Choose a non-empty image up to 2 MB.');
        return;
      }
      onChange({ ...asset, mimeType });
    } catch {
      setError('The image could not be opened. Choose another file.');
    }
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? 'Replace evidence image' : 'Choose evidence image'}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={pickFile}
        style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
      >
        <Ionicons name={value ? 'image-outline' : 'attach-outline'} size={20} color={colors.moss} />
        <Text style={styles.attachmentName} numberOfLines={1}>{value?.name ?? 'Choose an image'}</Text>
        <Text style={styles.attachmentAction}>{value ? 'Replace' : 'Browse'}</Text>
      </Pressable>
      {!!value && (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => { setError(''); onChange(null); }}
          style={styles.remove}
        >
          <Text style={styles.attachmentAction}>Remove image</Text>
        </Pressable>
      )}
      <Text style={styles.note}>JPEG or PNG up to 2 MB. Only reviewers can see the image.</Text>
      <Notice>{error}</Notice>
    </View>
  );
}

export function VisitorRequired({ session, navigation, action }) {
  return (
    <Panel icon="person-outline" title={session ? 'Visitor account required' : 'Sign in to continue'}>
      <Text style={styles.note}>
        {session ? `Use a visitor account to ${action}.` : `Sign in with your visitor account to ${action}.`}
      </Text>
      {!session && <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />}
    </Panel>
  );
}

export const visitorStyles = StyleSheet.create({
  stack: { gap: 16 },
  form: { gap: 20 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { fontFamily: serif, color: colors.ink, fontSize: 25, lineHeight: 30 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: {
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
  },
  rowContent: { flex: 1, gap: 4 },
  itemTitle: { fontFamily: serif, color: colors.ink, fontSize: 19, lineHeight: 25 },
  actionIcon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 36, flexGrow: 1 },
  page: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  heading: { gap: 7, marginTop: 6, marginBottom: 26 },
  title: { fontFamily: serif, fontSize: 39, lineHeight: 46, letterSpacing: -1.5, color: colors.ink },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted },
  back: {
    width: 44,
    height: 44,
    marginLeft: -4,
    marginBottom: 11,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.64 },
  button: {
    minHeight: 50,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    backgroundColor: colors.moss,
  },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonLabel: { color: colors.white, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  secondaryLabel: { color: colors.moss },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.ink,
    backgroundColor: colors.paper,
    fontSize: 16,
    lineHeight: 22,
  },
  focused: { borderColor: colors.moss },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.clay, fontSize: 14, lineHeight: 20 },
  panel: {
    gap: 12,
    alignItems: 'stretch',
    backgroundColor: colors.cream,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  panelIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E9EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: { fontFamily: serif, color: colors.ink, fontSize: 24, lineHeight: 30 },
  loading: { minHeight: 75, alignItems: 'center', justifyContent: 'center', gap: 10 },
  attachment: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  attachmentName: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14 },
  attachmentAction: { color: colors.moss, fontWeight: '600', fontSize: 13 },
  remove: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center' },
});
