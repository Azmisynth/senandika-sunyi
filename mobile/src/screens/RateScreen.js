import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { submitRating } from '../lib/ApiService';
import { useSession } from '../lib/Session';
import { Button, colors, EvidenceField, Notice, Panel, VisitorRequired, VisitorScreen, visitorStyles } from './VisitorUI';

const scores = [1, 2, 3, 4, 5];

export default function RateScreen({ navigation, route }) {
  const { session } = useSession();
  const { slug, title } = route.params ?? {};
  const [score, setScore] = useState(0);
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submitting = useRef(false);

  async function send() {
    if (submitting.current) return;
    if (!score || !evidence) {
      setError('Select a rating and attach proof of your visit.');
      return;
    }
    submitting.current = true;
    setError('');
    setBusy(true);
    try {
      await submitRating(slug, score, evidence, session.token);
      setSubmitted(true);
    } catch (failure) {
      setError(failure.message || 'The rating could not be sent. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function back() {
    if (busy) return;
    if (navigation.canGoBack()) navigation.goBack();
    else if (slug) navigation.replace('Destination', { slug });
    else navigation.replace('Dashboard');
  }

  return (
    <VisitorScreen title="Rate your visit" subtitle={title} onBack={back}>
      {submitted ? (
        <Panel icon="checkmark-outline" title="Rating submitted">
          <Text style={visitorStyles.body}>Your rating will be included after a reviewer verifies your visit. You can follow its status in Account.</Text>
          <Button label="Back to destination" onPress={back} secondary />
        </Panel>
      ) : session?.role !== 'visitor' ? (
        <VisitorRequired session={session} navigation={navigation} action="submit a rating" />
      ) : (
        <View style={visitorStyles.form}>
          <View style={styles.scoreGroup}>
            <Text style={visitorStyles.label}>Your rating</Text>
            <View style={styles.scoreRow} accessibilityRole="radiogroup">
              {scores.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${value} out of 5`}
                  accessibilityState={{ checked: score === value, disabled: busy }}
                  disabled={busy}
                  onPress={() => { setScore(value); setError(''); }}
                  style={({ pressed }) => [
                    styles.scoreButton,
                    score >= value && styles.scoreOn,
                    pressed && visitorStyles.pressed,
                  ]}
                >
                  <Ionicons name={score >= value ? 'star' : 'star-outline'} size={21} color={colors.moss} />
                </Pressable>
              ))}
            </View>
            <Text accessibilityLiveRegion="polite" style={visitorStyles.note}>
              {score ? `${score} out of 5 selected` : 'Select a rating from 1 to 5.'}
            </Text>
          </View>
          <EvidenceField
            label="Proof of visit"
            value={evidence}
            onChange={(image) => { setEvidence(image); setError(''); }}
            disabled={busy}
          />
          <Notice>{error}</Notice>
          <Button label={busy ? 'Submitting rating' : 'Submit rating'} busy={busy} onPress={send} />
        </View>
      )}
    </VisitorScreen>
  );
}

const styles = StyleSheet.create({
  scoreGroup: { gap: 8 },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scoreButton: {
    minWidth: 44,
    minHeight: 45,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreOn: { borderColor: '#AEBDAF', backgroundColor: '#E9EDE2' },
});
