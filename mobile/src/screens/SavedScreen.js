import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { listFavorites, setFavorite } from '../lib/ApiService';
import { useSession } from '../lib/Session';
import { Button, colors, Loading, Notice, Panel, useVisitorList, VisitorScreen, visitorStyles } from './VisitorUI';

export default function SavedScreen({ navigation }) {
  const { session } = useSession();
  const token = session?.role === 'visitor' ? session.token : null;
  const { busy, items, error, reload } = useVisitorList(listFavorites, token);
  const [updating, setUpdating] = useState(null);
  const [actionError, setActionError] = useState('');

  async function remove(slug) {
    if (updating) return;
    setUpdating(slug);
    setActionError('');
    try {
      await setFavorite(slug, false, token);
      reload();
    } catch (failure) {
      setActionError(failure.message || 'The saved place could not be removed.');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <VisitorScreen title="Saved places" subtitle="Destinations you want to come back to.">
      {!token && (
        <Panel icon="bookmark-outline" title={session ? 'Visitor account required' : 'Save a place for later'}>
          <Text style={visitorStyles.body}>Sign in with a visitor account to keep a private list of places you plan to visit.</Text>
          {!session && <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />}
        </Panel>
      )}
      {busy && <Loading label="Loading saved places" />}
      {error && (
        <Panel icon="cloud-offline-outline" title="Saved places unavailable">
          <Notice>{error}</Notice>
          <Button label="Try again" onPress={reload} secondary />
        </Panel>
      )}
      {token && items?.length === 0 && (
        <Panel icon="bookmark-outline" title="No saved places yet">
          <Text style={visitorStyles.body}>Save a destination from its detail page and it will appear here.</Text>
          <Button label="Explore destinations" secondary onPress={() => navigation.navigate('Explore')} />
        </Panel>
      )}
      {!!items?.length && (
        <View style={visitorStyles.stack}>
          <Notice>{actionError}</Notice>
          <View style={visitorStyles.list}>
            {items.map((place) => (
              <View key={place.slug} style={visitorStyles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${place.title}`}
                  onPress={() => navigation.navigate('Destination', { slug: place.slug })}
                  style={({ pressed }) => [visitorStyles.rowContent, pressed && visitorStyles.pressed]}
                >
                  <Text style={visitorStyles.itemTitle}>{place.title}</Text>
                  <Text style={visitorStyles.note}>{place.category}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${place.title} from saved places`}
                  accessibilityState={{ disabled: Boolean(updating) }}
                  disabled={Boolean(updating)}
                  onPress={() => remove(place.slug)}
                  style={({ pressed }) => [visitorStyles.actionIcon, pressed && visitorStyles.pressed]}
                >
                  <Ionicons name="bookmark" size={20} color={colors.moss} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}
    </VisitorScreen>
  );
}
