import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { colors } from './theme'

export function Spinner({ label = 'Laden…', compact }: { label?: string; compact?: boolean }) {
  const outer = useRef(new Animated.Value(0)).current
  const inner = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(outer, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    )
    const b = Animated.loop(
      Animated.timing(inner, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    )
    a.start()
    b.start()
    return () => {
      a.stop()
      b.stop()
    }
  }, [outer, inner])

  const size = compact ? 18 : 56
  const ring = compact ? 2 : 3
  const rotate = outer.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const reverse = inner.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] })

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: ring,
              borderColor: compact ? 'rgba(26,20,8,0.22)' : colors.line,
              borderTopColor: compact ? '#1A1408' : colors.gold,
              transform: [{ rotate }],
            },
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: (size * 0.62) / 2,
              borderWidth: ring,
              borderColor: 'transparent',
              borderTopColor: compact ? '#1A1408' : colors.teal,
              transform: [{ rotate: reverse }],
            },
          ]}
        />
        {!compact && <View style={styles.dot} />}
      </View>
      {!compact && (
        <>
          <Text style={styles.kicker}>FIELDOPS</Text>
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
  },
  kicker: { color: colors.gold, letterSpacing: 2.6, fontSize: 11, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 14 },
})
