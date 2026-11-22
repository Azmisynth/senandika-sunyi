import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getDestination,
  listFavorites,
  listLikes,
  setFavorite,
  setLike,
} from '../lib/ApiService';
import { useSession } from '../lib/Session';

const serif = Platform.select({ android: 'serif', default: 'Georgia' });

export default function DestinationScreen({ route, navigation }) {
  const { slug } = route.params;
  const { session } = useSession();
  const [destination, setDestination] = useState(null);
  const [error, setError] = useState('');
  const [personalError, setPersonalError] = useState('');
  const [mapError, setMapError] = useState('');
  const [personalReady, setPersonalReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState('');
  const actionLock = useRef(false);
  const signedIn = session?.role === 'visitor';
  const token = session?.token;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError('');
      setPersonalError('');
      setPersonalReady(false);
      setMapError('');
      setLoading(true);
      setLoadingActions(Boolean(signedIn));

      getDestination(slug)
        .then((value) => {
          if (active) setDestination(value);
        })
        .catch(() => {
          if (active) setError('This destination could not be loaded.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      if (signedIn) {
        Promise.all([listFavorites(token), listLikes(token)])
          .then(([favorites, likes]) => {
            if (!active) return;
            setSaved(favorites.some((favorite) => favorite.slug === slug));
            setLiked(likes.includes(slug));
            setPersonalReady(true);
          })
          .catch(() => {
            if (active) setPersonalError('Saved and liked status could not be loaded.');
          })
          .finally(() => {
            if (active) setLoadingActions(false);
          });
      } else {
        setSaved(false);
        setLiked(false);
      }

      return () => {
        active = false;
      };
    }, [slug, signedIn, token, retry]),
  );

  function authorize() {
    if (signedIn) return true;
    if (session) {
      setPersonalError('Sign in with a visitor account to use this feature.');
    } else {
      navigation.navigate('SignIn');
    }
    return false;
  }

  async function update(kind) {
    if (!authorize() || !personalReady || actionLock.current) return;
    const isSave = kind === 'save';
    const enabled = isSave ? !saved : !liked;
    actionLock.current = true;
    setSaving(kind);
    setPersonalError('');
    try {
      if (isSave) {
        await setFavorite(slug, enabled, token);
        setSaved(enabled);
      } else {
        await setLike(slug, enabled, token);
        setLiked(enabled);
        try {
          setDestination(await getDestination(slug));
        } catch {
          setDestination((current) => ({
            ...current,
            like_count: Math.max(0, current.like_count + (enabled ? 1 : -1)),
          }));
        }
      }
    } catch {
      setPersonalError('Your change could not be saved. Please try again.');
    } finally {
      setSaving('');
      actionLock.current = false;
    }
  }

  function openFeedback(name) {
    if (authorize()) navigation.navigate(name, { slug, title: destination.title });
  }

  async function openMap() {
    const { latitude, longitude } = destination;
    setMapError('');
    try {
      await Linking.openURL(`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`);
    } catch {
      setMapError('The map could not be opened.');
    }
  }

  function goBack() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Dashboard', { screen: 'Explore' });
  }

  function tryAgain() {
    setRetry((attempt) => attempt + 1);
  }

  const checkedOn = destination?.checked_on
    ? new Date(`${destination.checked_on}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    : null;

  const rating = destination?.rating_count
    ? `${destination.rating_average.toFixed(1)} / 5 · ${destination.rating_count} approved ${destination.rating_count === 1 ? 'rating' : 'ratings'}`
    : 'No approved ratings yet.';
  const interactiveActionsDisabled = loadingActions || Boolean(saving) || (signedIn && !personalReady);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={6}
          onPress={goBack}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={20} color="#2F493B" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
      {destination ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.category}>{destination.category}</Text>
          <Text accessibilityRole="header" style={styles.title}>{destination.title}</Text>
          {checkedOn ? <Text style={styles.date}>Field checked {checkedOn}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: saved, disabled: interactiveActionsDisabled }}
              disabled={interactiveActionsDisabled}
              onPress={() => update('save')}
              style={[styles.button, saved && styles.selectedButton]}
            >
              {saving === 'save' ? (
                <ActivityIndicator size="small" color="#2F493B" />
              ) : (
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color="#2F493B" />
              )}
              <Text style={styles.buttonLabel}>{saved ? 'Saved' : 'Save'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Remove like' : 'Like this destination'}
              accessibilityState={{ selected: liked, disabled: interactiveActionsDisabled }}
              disabled={interactiveActionsDisabled}
              onPress={() => update('like')}
              style={[styles.button, liked && styles.selectedButton]}
            >
              {saving === 'like' ? (
                <ActivityIndicator size="small" color="#9B4D36" />
              ) : (
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color="#9B4D36" />
              )}
              <Text style={styles.buttonLabel}>
                {destination.like_count} {destination.like_count === 1 ? 'like' : 'likes'}
              </Text>
            </Pressable>
          </View>
          {personalError || error ? (
            <View style={styles.notice}>
              <Text accessibilityLiveRegion="polite" style={styles.error}>{personalError || error}</Text>
              {error || personalError.includes('could not be loaded') ? (
                <Pressable accessibilityRole="button" onPress={tryAgain} style={styles.retry}>
                  <Text style={styles.link}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Editorial review</Text>
            <Text style={styles.review}>{destination.review}</Text>
          </View>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Plan your visit</Text>
            <View style={styles.noteList}>
              <VisitNote title="Cost" detail={destination.cost} />
              <VisitNote title="Getting there" detail={destination.access} />
              <VisitNote title="Local etiquette" detail={destination.etiquette} />
            </View>
            <Pressable accessibilityRole="link" onPress={openMap} style={styles.map}>
              <Ionicons name="location-outline" size={20} color="#2F493B" />
              <View style={styles.mapLabel}>
                <Text style={styles.buttonLabel}>Open map</Text>
                <Text style={styles.coordinates}>
                  {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
                </Text>
              </View>
              <Ionicons name="open-outline" size={17} color="#2F493B" />
            </Pressable>
            {mapError ? (
              <Text accessibilityLiveRegion="polite" style={styles.mapError}>{mapError}</Text>
            ) : null}
          </View>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Visitor ratings</Text>
            <Text style={styles.body}>{rating}</Text>
            <View style={styles.feedback}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openFeedback('Rate')}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryLabel}>Rate this visit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => openFeedback('Report')}
                style={styles.report}
              >
                <Text style={styles.link}>Report a change</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color="#2F493B" style={styles.spinner} />
      ) : (
        <View style={styles.empty}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={tryAgain} style={styles.retry}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function VisitNote({ title, detail }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteLabel}>{title}</Text>
      <Text style={styles.body}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBF9F4' },
  topBar: { width: '100%', maxWidth: 590, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 5 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 2, minHeight: 44 },
  backText: { color: '#2F493B', fontSize: 15, fontWeight: '500' },
  content: { width: '100%', maxWidth: 590, alignSelf: 'center', paddingHorizontal: 23, paddingTop: 13, paddingBottom: 35 },
  category: { textTransform: 'uppercase', color: '#9B4D36', fontSize: 12, fontWeight: '600', letterSpacing: 1.05 },
  title: { fontFamily: serif, color: '#242A23', fontSize: 41, lineHeight: 46, letterSpacing: -1.4, marginTop: 8 },
  date: { color: '#596456', fontSize: 14, lineHeight: 20, marginTop: 11 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DCDDD1', borderRadius: 5 },
  selectedButton: { backgroundColor: '#ECF0E8', borderColor: '#B7C2B2' },
  buttonLabel: { color: '#2F493B', fontSize: 14, fontWeight: '600' },
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#B7BCAF', paddingTop: 15, marginTop: 23 },
  sectionTitle: { color: '#242A23', fontFamily: serif, fontSize: 25, lineHeight: 29, letterSpacing: -0.45, marginBottom: 8 },
  review: { color: '#333B32', fontFamily: serif, fontSize: 18, lineHeight: 27 },
  body: { color: '#596456', fontSize: 14, lineHeight: 21 },
  noteList: { gap: 13 },
  note: { gap: 2 },
  noteLabel: { color: '#242A23', fontSize: 14, fontWeight: '600' },
  map: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: '#F1F2E8', borderRadius: 5, marginTop: 14 },
  mapLabel: { flex: 1, gap: 3 },
  coordinates: { color: '#596456', fontSize: 12 },
  feedback: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 13 },
  primaryButton: { backgroundColor: '#2F493B', borderRadius: 5, minHeight: 44, justifyContent: 'center', paddingHorizontal: 15 },
  primaryLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  report: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  link: { color: '#2F493B', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  error: { color: '#9B4D36', fontSize: 14, lineHeight: 20 },
  notice: { marginTop: 9 },
  mapError: { color: '#9B4D36', fontSize: 14, lineHeight: 20, marginTop: 8 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8 },
  empty: { width: '100%', maxWidth: 590, alignSelf: 'center', paddingHorizontal: 23, paddingTop: 28 },
  spinner: { marginTop: 32 },
});
