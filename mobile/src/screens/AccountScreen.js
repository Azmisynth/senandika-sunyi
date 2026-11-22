import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { listRatings } from '../lib/ApiService';
import { useSession } from '../lib/Session';
import { Button, colors, Loading, Notice, Panel, useVisitorList, VisitorScreen, visitorStyles } from './VisitorUI';

const statuses = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };

function placeName(slug) {
  return slug.replace(/(^|-)([a-z])/g, (_, separator, initial) => (separator ? ' ' : '') + initial.toUpperCase());
}

export default function AccountScreen({ navigation }) {
  const { session, signOut } = useSession();
  const token = session?.role === 'visitor' ? session.token : null;
  const { busy, items, error, reload } = useVisitorList(listRatings, token);
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function leaveSession() {
    setSignOutError('');
    setSigningOut(true);
    try {
      await signOut();
    } catch (failure) {
      setSignOutError(failure.message || 'Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <VisitorScreen title="Account">
      {!session && (
        <Panel icon="person-outline" title="Sign in to your account">
          <Text style={visitorStyles.body}>Keep a list of places to visit and track the ratings you submit.</Text>
          <Button label="Sign in" onPress={() => navigation.navigate('SignIn')} />
        </Panel>
      )}
      {session && (
        <View style={visitorStyles.form}>
          <View style={styles.identity}>
            <View style={styles.avatar}><Ionicons name="person-outline" size={21} color={colors.moss} /></View>
            <View style={visitorStyles.rowContent}>
              <Text style={visitorStyles.itemTitle}>{session.username}</Text>
              <Text style={styles.role}>{session.role}</Text>
            </View>
          </View>
          {!!token && (
            <View style={visitorStyles.stack}>
              <Text accessibilityRole="header" style={visitorStyles.section}>My ratings</Text>
              {busy && <Loading label="Loading your ratings" />}
              {error && (
                <Panel icon="cloud-offline-outline" title="Ratings unavailable">
                  <Notice>{error}</Notice>
                  <Button label="Try again" onPress={reload} secondary />
                </Panel>
              )}
              {items?.length === 0 && (
                <Text style={visitorStyles.body}>Ratings you submit after a visit will appear here.</Text>
              )}
              {!!items?.length && (
                <View style={visitorStyles.list}>
                  {items.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('Destination', { slug: item.slug })}
                      style={({ pressed }) => [visitorStyles.row, pressed && visitorStyles.pressed]}
                    >
                      <View style={visitorStyles.rowContent}>
                        <Text style={visitorStyles.itemTitle}>{item.title || placeName(item.slug)}</Text>
                        <Text style={visitorStyles.note}>
                          {item.score}/5 · {statuses[item.status] ?? item.status}
                        </Text>
                        {item.status === 'rejected' && (
                          <Text style={visitorStyles.note}>You can submit again with new evidence.</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          <Notice>{signOutError}</Notice>
          <Button label="Sign out" onPress={leaveSession} busy={signingOut} secondary />
        </View>
      )}
    </VisitorScreen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 15,
    backgroundColor: colors.cream,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9EDE2',
  },
  role: { ...visitorStyles.note, textTransform: 'capitalize' },
});
