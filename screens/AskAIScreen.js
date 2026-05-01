import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { supabase } from '../services/supabase';
import { FONT_SIZES, SPACING, RADIUS, CONTENT_MAX_WIDTH } from '../styles/typography';

const STARTER_QUESTIONS = [
  'Is this environment safe for medication storage?',
  'Were there any unusual patterns in the last 48 hours?',
  'What is the trend for today?',
];

// ─── Message bubble ───────────────────────────────────────────────────────────
const MessageBubble = ({ item, theme }) => {
  const isUser  = item.role === 'user';
  const isError = item.role === 'error';

  const bubbleBg =
    isUser  ? theme.primary :
    isError ? theme.dangerBg :
    theme.surfaceAlt;

  const textColor =
    isUser  ? '#ffffff' :
    isError ? theme.danger :
    theme.text;

  const borderColor = isError ? theme.danger : undefined;

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: theme.primaryLight }]}>
          <Ionicons
            name={isError ? 'warning-outline' : 'sparkles-outline'}
            size={14}
            color={isError ? theme.danger : theme.primary}
          />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser  && styles.bubbleUser,
          !isUser && styles.bubbleAI,
          borderColor && { borderWidth: 1, borderColor },
        ]}
      >
        <Text style={[styles.bubbleText, { color: textColor }]}>{item.text}</Text>
      </View>
    </View>
  );
};

// ─── Typing indicator bubble ──────────────────────────────────────────────────
const TypingBubble = ({ theme }) => (
  <View style={[styles.row, styles.rowLeft]}>
    <View style={[styles.avatar, { backgroundColor: theme.primaryLight }]}>
      <Ionicons name="sparkles-outline" size={14} color={theme.primary} />
    </View>
    <View style={[styles.bubble, styles.bubbleAI, { backgroundColor: theme.surfaceAlt }]}>
      <ActivityIndicator size="small" color={theme.primary} />
    </View>
  </View>
);

// ─── Screen ───────────────────────────────────────────────────────────────────
const AskAIScreen = ({ navigation, route }) => {
  const { deviceId } = route.params ?? {};
  const { theme }    = useTheme();

  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const listRef      = useRef(null);
  const loadingRef   = useRef(false);
  const messagesRef  = useRef([]);

  // Keep ref in sync so sendQuestion always reads latest history
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Style the navigation header to match the app's tab bar header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown:      true,
      headerTitle:      'Ask AI',
      headerStyle:      { backgroundColor: theme.navBg },
      headerTitleStyle: { color: theme.navText, fontSize: FONT_SIZES.lg, fontWeight: '700', letterSpacing: -0.5 },
      headerTintColor:  theme.navText,
    });
  }, [navigation, theme]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const sendQuestion = useCallback(async (question) => {
    const trimmed = question.trim();
    if (!trimmed || loadingRef.current || !deviceId) return;

    // Snapshot history before appending the new user message
    const history = messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'ai')
      .map(m => ({ role: m.role, text: m.text }));

    // Append user message immediately
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setInput('');
    loadingRef.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ask-ai', {
        body: { device_id: deviceId, question: trimmed, history },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'ai', text: data.answer },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'error', text: 'Could not get a response. Try again.' },
      ]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [deviceId]);

  const handleSend = () => sendQuestion(input);

  if (!deviceId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
        <Ionicons name="warning-outline" size={40} color={theme.danger} />
        <Text style={{ color: theme.danger, fontSize: FONT_SIZES.base, marginTop: SPACING.md, textAlign: 'center' }}>
          No device selected. Go back and open Ask AI from a device.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Message list ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.listContentCentered,
        ]}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyAvatar, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="chatbubbles-outline" size={36} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Ask about your sensor data
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              I can analyse temperature and humidity patterns, flag anomalies, and give recommendations based on medical storage guidelines.
            </Text>
          </View>
        }
        ListFooterComponent={loading ? <TypingBubble theme={theme} /> : null}
        renderItem={({ item }) => <MessageBubble item={item} theme={theme} />}
      />

      {/* ── Bottom input area ── */}
      <View style={[styles.inputArea, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>

        {/* Starter chips — only shown when no messages yet */}
        {messages.length === 0 && !loading && (
          <View style={styles.chips}>
            {STARTER_QUESTIONS.map(q => (
              <TouchableOpacity
                key={q}
                onPress={() => sendQuestion(q)}
                style={[styles.chip, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '50' }]}
              >
                <Text style={[styles.chipText, { color: theme.primary }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.textInput,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor:     theme.border,
                color:           theme.text,
              },
            ]}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={loading || !input.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: loading || !input.trim() ? theme.border : theme.primary },
            ]}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  // List
  listContent: {
    padding:       SPACING.base,
    paddingBottom: SPACING.lg,
    maxWidth:      CONTENT_MAX_WIDTH,
    width:         '100%',
    alignSelf:     'center',
  },
  listContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems:       'center',
    paddingHorizontal: SPACING.xl,
    gap:              SPACING.md,
  },
  emptyAvatar: {
    width:         72,
    height:        72,
    borderRadius:  36,
    alignItems:    'center',
    justifyContent:'center',
    marginBottom:  SPACING.xs,
  },
  emptyTitle: {
    fontSize:    FONT_SIZES.lg,
    fontWeight:  '700',
    textAlign:   'center',
  },
  emptySubtitle: {
    fontSize:   FONT_SIZES.sm,
    textAlign:  'center',
    lineHeight: 20,
  },

  // Rows
  row:      { flexDirection: 'row', marginBottom: SPACING.sm, alignItems: 'flex-end' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft:  { justifyContent: 'flex-start' },

  // Avatar (AI side only)
  avatar: {
    width:         28,
    height:        28,
    borderRadius:  14,
    alignItems:    'center',
    justifyContent:'center',
    marginRight:   SPACING.xs,
    flexShrink:    0,
  },

  // Bubbles
  bubble: {
    maxWidth:     '78%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm + 2,
  },
  bubbleUser: {
    borderBottomRightRadius: RADIUS.sm,
  },
  bubbleAI: {
    borderBottomLeftRadius: RADIUS.sm,
  },
  bubbleText: {
    fontSize:   FONT_SIZES.sm,
    lineHeight: 20,
  },

  // Bottom area
  inputArea: {
    borderTopWidth: 1,
    paddingHorizontal: SPACING.base,
    paddingTop:     SPACING.sm,
    paddingBottom:  Platform.OS === 'ios' ? SPACING.xl : SPACING.md,
  },

  // Starter chips
  chips: {
    gap:           SPACING.xs,
    marginBottom:  SPACING.sm,
  },
  chip: {
    borderWidth:       1,
    borderRadius:      RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.xs + 2,
    alignSelf:         'flex-start',
  },
  chipText: {
    fontSize:   FONT_SIZES.xs,
    fontWeight: '600',
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:           SPACING.sm,
  },
  textInput: {
    flex:              1,
    borderWidth:       1.5,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm + 2,
    fontSize:          FONT_SIZES.base,
    maxHeight:         120,
    minHeight:         44,
  },
  sendBtn: {
    width:         44,
    height:        44,
    borderRadius:  22,
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
  },
});

export default AskAIScreen;
