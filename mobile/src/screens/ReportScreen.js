import React, { useRef, useState } from 'react';
import { View } from 'react-native';

import { attachReportEvidence, submitReport } from '../lib/ApiService';
import { useSession } from '../lib/Session';
import { Button, EvidenceField, Field, Notice, Panel, VisitorRequired, VisitorScreen, visitorStyles } from './VisitorUI';

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return 'Enter the observation date as YYYY-MM-DD.';
  }

  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return 'Enter a valid observation date.';
  }

  const baliDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return value > baliDate ? 'The observation date cannot be in the future.' : '';
}

export default function ReportScreen({ navigation, route }) {
  const { session } = useSession();
  const { slug, title } = route.params ?? {};
  const [description, setDescription] = useState('');
  const [observedOn, setObservedOn] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  async function send() {
    if (submitting.current) return;
    const notes = description.trim();
    const date = observedOn.trim();
    if (!reportId) {
      const issue = notes ? validateDate(date) : 'Describe what changed.';
      if (issue) {
        setError(issue);
        return;
      }
    }
    if (reportId && !evidence) {
      setError('Choose an image to attach or finish without one.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      if (reportId) {
        await attachReportEvidence(reportId, evidence, session.token);
      } else {
        await submitReport(slug, { description: notes, observed_on: date }, evidence, session.token);
      }
      setSubmitted(true);
    } catch (failure) {
      if (failure.reportId) setReportId(failure.reportId);
      setError(failure.reportId
        ? 'The report was saved, but the image upload failed. You can retry the attachment below.'
        : failure.message || 'The report could not be sent. Please try again.');
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
    <VisitorScreen title="Report a change" subtitle={title} onBack={back}>
      {submitted ? (
        <Panel icon="checkmark-outline" title="Report received">
          <Button label="Back to destination" onPress={back} secondary />
        </Panel>
      ) : session?.role !== 'visitor' ? (
        <VisitorRequired session={session} navigation={navigation} action="report a change" />
      ) : (
        <View style={visitorStyles.form}>
          {!reportId && (
            <>
              <Field
                label="What changed?"
                value={description}
                onChangeText={(value) => { setDescription(value); setError(''); }}
                placeholder="Describe the change to costs, access, or other details."
                multiline
                textAlignVertical="top"
                maxLength={4000}
                editable={!busy}
                style={{ minHeight: 108 }}
              />
              <Field
                label="Date observed"
                value={observedOn}
                onChangeText={(value) => { setObservedOn(value); setError(''); }}
                placeholder="YYYY-MM-DD"
                hint="Enter the date in Bali."
                maxLength={10}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
            </>
          )}
          <EvidenceField label="Supporting image (optional)" value={evidence} onChange={setEvidence} disabled={busy} />
          <Notice>{error}</Notice>
          <Button label={reportId ? 'Retry image upload' : 'Submit report'} busy={busy} onPress={send} />
          {reportId && <Button label="Finish without an image" disabled={busy} secondary onPress={() => setSubmitted(true)} />}
        </View>
      )}
    </VisitorScreen>
  );
}
