import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listDestinations } from '../lib/ApiService';

const illustration = require('../../assets/bali-editorial.jpg');
const categories = ['Culture', 'Nature', 'Food', 'Community'];
const pageSize = 24;
const serif = Platform.select({ android: 'serif', default: 'Georgia' });

export default function ExploreScreen({ navigation }) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [additionalCategories, setAdditionalCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setPage(0);
    setRetry((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    const delay = setTimeout(async () => {
      try {
        const result = await listDestinations({
          q: keyword.trim(),
          category,
          limit: pageSize,
          offset: page * pageSize,
        });
        if (!current) return;
        setItems((previous) => (page === 0 ? result : [...previous, ...result]));
        setMore(result.length === pageSize);

        if (!keyword.trim() && !category) {
          setAdditionalCategories((previous) => {
            const values = new Map([...categories, ...previous].map((value) => [value.toLowerCase(), value]));
            for (const destination of result) {
              const key = destination.category.toLowerCase();
              if (!values.has(key)) values.set(key, destination.category);
            }
            return [...values.values()].slice(categories.length);
          });
        }
      } catch {
        if (current) setLoadError('Destinations could not be loaded. Please try again.');
      } finally {
        if (current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, keyword ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(delay);
    };
  }, [category, keyword, page, retry]);

  function search(value) {
    setKeyword(value);
    setPage(0);
    setItems([]);
    setLoading(true);
    setMore(false);
  }

  function filter(value) {
    if (value === category) return;
    setCategory(value);
    setPage(0);
    setItems([]);
    setLoading(true);
    setMore(false);
  }

  const onlyLoading = loading && items.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <>
            <Text style={styles.wordmark}>Senandika Sunyi</Text>
            <Text accessibilityRole="header" style={styles.title}>Explore Bali</Text>
            <Image
              accessible={false}
              source={illustration}
              resizeMode="cover"
              style={styles.illustration}
            />
            <View style={styles.search}>
              <Ionicons name="search-outline" size={19} color="#596456" />
              <TextInput
                accessibilityLabel="Search destinations"
                placeholder="Search destinations"
                placeholderTextColor="#686F62"
                value={keyword}
                onChangeText={search}
                autoCorrect={false}
                returnKeyType="search"
                style={styles.input}
              />
              {keyword ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => search('')}
                  style={styles.clear}
                >
                  <Ionicons name="close" size={18} color="#596456" />
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {['', ...categories, ...additionalCategories].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === category }}
                  onPress={() => filter(value)}
                  style={[styles.chip, value === category && styles.activeChip]}
                >
                  <Text style={[styles.chipText, value === category && styles.activeChipText]}>
                    {value || 'All places'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.sectionHeading}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Destinations</Text>
            </View>
            {loadError ? (
              <View style={styles.message}>
                <Text accessibilityLiveRegion="polite" style={styles.messageText}>{loadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetry((attempt) => attempt + 1)}
                  style={styles.textAction}
                >
                  <Text style={styles.actionLabel}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.category}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => navigation.navigate('Destination', { slug: item.slug })}
          >
            <View style={styles.destinationText}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.destinationTitle}>{item.title}</Text>
              <Text numberOfLines={2} style={styles.description}>{item.review}</Text>
            </View>
            <Ionicons name="arrow-forward" size={19} color="#2F493B" />
          </Pressable>
        )}
        ListEmptyComponent={
          onlyLoading ? <ActivityIndicator color="#2F493B" style={styles.spinner} /> : !loadError ? (
            <View style={styles.message}>
              <Text accessibilityLiveRegion="polite" style={styles.messageText}>
                {keyword.trim() || category ? 'No destinations match your search.' : 'No destinations have been published yet.'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && items.length > 0 && !refreshing ? (
            <ActivityIndicator color="#2F493B" style={styles.spinner} />
          ) : more && !loadError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoading(true);
                setPage((previous) => previous + 1);
              }}
              style={styles.loadMore}
            >
              <Text style={styles.actionLabel}>Show more destinations</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBF9F4' },
  content: { width: '100%', maxWidth: 590, alignSelf: 'center', paddingHorizontal: 23, paddingTop: 21, paddingBottom: 24 },
  wordmark: { color: '#2F493B', fontFamily: serif, fontSize: 18 },
  title: { color: '#242A23', fontFamily: serif, fontSize: 44, letterSpacing: -1.7, marginTop: 12, marginBottom: 17 },
  illustration: { width: '100%', height: 171, borderRadius: 5, backgroundColor: '#E3E5D7' },
  search: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#DCDDD1', borderRadius: 5, paddingHorizontal: 13, backgroundColor: '#F8F5EE', marginTop: 17 },
  input: { flex: 1, color: '#242A23', fontSize: 15, paddingVertical: 10, minWidth: 0 },
  clear: { padding: 3 },
  filters: { gap: 7, alignItems: 'center', paddingTop: 12, paddingBottom: 3 },
  chip: { alignItems: 'center', justifyContent: 'center', minHeight: 38, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DCDDD1', borderRadius: 20 },
  activeChip: { backgroundColor: '#2F493B', borderColor: '#2F493B' },
  chipText: { color: '#2F493B', fontSize: 13, fontWeight: '500' },
  activeChipText: { color: '#FFFFFF' },
  sectionHeading: { marginTop: 25, paddingBottom: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#B7BCAF' },
  sectionTitle: { color: '#242A23', fontFamily: serif, fontSize: 26, letterSpacing: -0.4 },
  row: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#B7BCAF' },
  pressed: { opacity: 0.65 },
  destinationText: { flex: 1, minWidth: 0 },
  category: { color: '#9B4D36', marginBottom: 4, fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' },
  destinationTitle: { color: '#242A23', fontFamily: serif, fontSize: 22, lineHeight: 27 },
  description: { color: '#596456', fontSize: 14, lineHeight: 20, marginTop: 4 },
  message: { paddingVertical: 20, gap: 5 },
  messageText: { color: '#596456', fontSize: 14, lineHeight: 20 },
  textAction: { paddingVertical: 8, alignSelf: 'flex-start' },
  loadMore: { alignSelf: 'center', paddingVertical: 18 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#2F493B', textDecorationLine: 'underline' },
  spinner: { paddingVertical: 24 },
});
