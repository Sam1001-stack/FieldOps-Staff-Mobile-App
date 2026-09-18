/**
 * FieldOps field app — today's tour, status pipeline, assignment notices.
 * API: src/config.ts. Polls /jobs and /notifications. CMS on Konto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapList } from './src/api'
import { pickJobPhoto, photoFormData } from './src/media'
import { cardShadow, colors, statusTone } from './src/theme'
import { Spinner } from './src/spinner'

type Me = { id: string; name: string; role?: string | null; is_super_admin?: boolean; organization?: { name: string } | null }
type Job = {
  id: string
  title: string
  status: string
  status_label?: string
  site?: { address?: string }
  customer?: { phone?: string; name?: string }
  materials?: { id: string; name?: string; quantity: number }[]
  time_entries?: { id: string; started_at?: string; ended_at?: string | null }[]
  photos?: { id: string; kind?: string; url?: string }[]
}
type CatalogItem = { id: number; public_id: string; name: string; unit?: string; unit_price_cents?: number }
type Notice = {
  id: string
  type?: string
  title: string
  body: string
  unread: boolean
  type_label?: string
  data?: { job_id?: string }
}
type ContentPage = { slug: string; title: string; body?: string; audience?: string }

const TOKEN_KEY = 'fieldops.field.token'
type Tab = 'today' | 'jobs' | 'alerts' | 'me'

const pipeline = [
  { key: 'assigned', label: 'Start' },
  { key: 'en_route', label: 'Fahrt' },
  { key: 'on_site', label: 'Vor Ort' },
  { key: 'completed', label: 'Fertig' },
] as const

function isMonteur(user: Me | null | undefined) {
  return user?.role === 'monteur'
}

function FieldApp() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const padH = width < 380 ? 16 : width > 428 ? 24 : 20
  const compact = width < 380
  const sheetMax = Math.min(width < 380 ? 380 : width > 428 ? 500 : 440, Math.round(height * 0.58))
  const [token, setToken] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [me, setMe] = useState<Me | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const seenNoticeIds = useRef<Set<string>>(new Set())
  const [open, setOpen] = useState<Job | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<ContentPage[]>([])
  const [openPage, setOpenPage] = useState<ContentPage | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [signerName, setSignerName] = useState('')
  const [photoBusy, setPhotoBusy] = useState<'before' | 'after' | null>(null)

  const loadPages = useCallback(async () => {
    const list = await api<ContentPage[]>('/api/v1/content?audience=field', null).catch(() => [])
    setPages(Array.isArray(list) ? list : [])
  }, [])

  const openContent = async (slug: string) => {
    try {
      const page = await api<ContentPage>(`/api/v1/content/${slug}`, null)
      setOpenPage(page)
    } catch (e) {
      Alert.alert('Inhalt', e instanceof Error ? e.message : 'Seite nicht gefunden')
    }
  }

  const rejectNonMonteur = async (auth: string, user: Me) => {
    if (isMonteur(user)) return false
    await api('/api/v1/auth/logout', auth, { method: 'POST' }).catch(() => {})
    await AsyncStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMe(null)
    setJobs([])
    Alert.alert('Anmeldung', 'Dieses Konto ist kein Monteur. Bitte die Field-App nur mit einem Monteur-Konto nutzen.')
    return true
  }

  const load = useCallback(async (auth: string) => {
    const [user, jobRes, noteRes, catalogRes] = await Promise.all([
      api<Me>('/api/v1/me', auth),
      api<{ data?: Job[] }>('/api/v1/jobs', auth),
      api<Notice[]>('/api/v1/notifications', auth).catch(() => []),
      api<CatalogItem[]>('/api/v1/catalog', auth).catch(() => []),
    ])
    if (await rejectNonMonteur(auth, user)) return
    const list = unwrapList(jobRes)
    const notes = Array.isArray(noteRes) ? noteRes : []
    setMe(user)
    setJobs(list)
    setCatalog(Array.isArray(catalogRes) ? catalogRes : [])
    const freshAssign = notes.filter(
      n => n.unread && n.type === 'job.assigned' && n.id && !seenNoticeIds.current.has(n.id),
    )
    if (freshAssign.length > 0 && seenNoticeIds.current.size > 0) {
      Vibration.vibrate([0, 50, 40, 50])
    }
    notes.forEach(n => n.id && seenNoticeIds.current.add(n.id))
    setNotices(notes)
    setOpen(current => (current ? list.find(j => j.id === current.id) ?? null : null))
  }, [])

  useEffect(() => {
    void loadPages()
    AsyncStorage.getItem(TOKEN_KEY).then(async t => {
      if (t) {
        setToken(t)
        try {
          await load(t)
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      }
      setBooting(false)
    })
  }, [load, loadPages])

  useEffect(() => {
    if (!token) {
      return
    }
    const tick = setInterval(() => {
      void load(token)
    }, 8000)
    return () => clearInterval(tick)
  }, [token, load])

  const login = async () => {
    setBusy(true)
    try {
      const r = await api<{ token: string; user: Me }>('/api/v1/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (await rejectNonMonteur(r.token, r.user)) return
      await AsyncStorage.setItem(TOKEN_KEY, r.token)
      setToken(r.token)
      setMe(r.user)
      await load(r.token)
    } catch (e) {
      Alert.alert('Anmeldung', e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (token) await api('/api/v1/auth/logout', token, { method: 'POST' }).catch(() => {})
    await AsyncStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setJobs([])
    setOpen(null)
  }

  const refresh = async () => {
    if (!token) return
    setRefreshing(true)
    try {
      await load(token)
    } finally {
      setRefreshing(false)
    }
  }

  const transition = async (job: Job, status: string) => {
    if (!token) return
    try {
      await api(`/api/v1/jobs/${job.id}/transition`, token, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      Vibration.vibrate(status === 'completed' ? [0, 40, 60, 40] : 12)
      await load(token)
    } catch (e) {
      Alert.alert('Status', e instanceof Error ? e.message : 'Fehler')
    }
  }

  const startTime = async (job: Job) => {
    if (!token) return
    try {
      await api(`/api/v1/jobs/${job.id}/time/start`, token, { method: 'POST' })
      await load(token)
    } catch (e) {
      Alert.alert('Zeit', e instanceof Error ? e.message : 'Fehler')
    }
  }

  const stopTime = async (job: Job) => {
    if (!token) return
    try {
      await api(`/api/v1/jobs/${job.id}/time/stop`, token, { method: 'POST' })
      await load(token)
    } catch (e) {
      Alert.alert('Zeit', e instanceof Error ? e.message : 'Fehler')
    }
  }

  const addMaterial = async (job: Job, item: CatalogItem) => {
    if (!token) return
    try {
      await api(`/api/v1/jobs/${job.id}/materials`, token, {
        method: 'POST',
        body: JSON.stringify({ catalog_item_id: item.id, quantity: 1 }),
      })
      await load(token)
      Alert.alert('Material', `${item.name} hinzugefügt`)
    } catch (e) {
      Alert.alert('Material', e instanceof Error ? e.message : 'Fehler')
    }
  }

  const uploadPhoto = async (job: Job, kind: 'before' | 'after' | 'other') => {
    if (!token || photoBusy) return
    const picked = await pickJobPhoto()
    if (!picked) return
    setPhotoBusy(kind === 'other' ? 'before' : kind)
    try {
      const updated = await api<Job>(`/api/v1/jobs/${job.id}/photos`, token, {
        method: 'POST',
        body: photoFormData(picked, kind),
      })
      setOpen(prev => (prev?.id === job.id ? { ...prev, ...updated, photos: updated.photos ?? prev.photos } : prev))
      await load(token)
      Alert.alert('Foto', kind === 'before' ? 'Vorher-Foto gespeichert' : kind === 'after' ? 'Nachher-Foto gespeichert' : 'Foto gespeichert')
    } catch (e) {
      Alert.alert('Foto', e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPhotoBusy(null)
    }
  }

  const signJob = async (job: Job) => {
    if (!token) return
    const name = signerName.trim() || job.customer?.name || me?.name || 'Kunde'
    // Minimal 1×1 PNG; API stores the signature file; name is the legal attestation.
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    try {
      await api(`/api/v1/jobs/${job.id}/signature`, token, {
        method: 'POST',
        body: JSON.stringify({ signature: tinyPng, signer_name: name }),
      })
      setSignerName('')
      await load(token)
      Alert.alert('Unterschrift', `Bestätigt von ${name}`)
    } catch (e) {
      Alert.alert('Unterschrift', e instanceof Error ? e.message : 'Fehler')
    }
  }

  const markNotice = async (notice: Notice) => {
    if (!token) return
    if (notice.unread) {
      await api(`/api/v1/notifications/${notice.id}/read`, token, { method: 'POST' }).catch(() => {})
    }
    const jobId = notice.data?.job_id
    if (jobId) {
      const match = jobs.find(j => j.id === jobId)
      if (match) {
        setTab('today')
        setOpen(match)
      }
    }
    await load(token)
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={styles.center}>
          <Spinner label="Tour wird geladen…" />
        </View>
      </SafeAreaView>
    )
  }

  if (openPage) {
    return <ContentReader page={openPage} onClose={() => setOpenPage(null)} />
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.auth, { paddingHorizontal: padH, paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.goldBar} />
          <Text style={styles.kicker}>MONTEUR</Text>
          <Text style={[styles.h1, compact && { fontSize: 26 }]}>Heute unterwegs.</Text>
          <Text style={styles.lead}>Tour, Navigation, Status — alles in einer Hand.</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            includeFontPadding={false}
            textAlignVertical="center"
            underlineColorAndroid="transparent"
            placeholder="E-Mail"
            placeholderTextColor={colors.muted}
            accessibilityLabel="E-Mail"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            includeFontPadding={false}
            textAlignVertical="center"
            underlineColorAndroid="transparent"
            placeholder="Passwort"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Passwort"
          />
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
            style={({ pressed }) => [styles.cta, busy && { opacity: 0.85 }, pressed && { opacity: 0.92 }]}
            onPress={login}
            disabled={busy}
          >
            {busy ? <Spinner compact /> : <Text style={styles.ctaText}>Anmelden</Text>}
          </Pressable>
          <LegalLinks pages={pages} onOpen={openContent} />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  const next = jobs.find(j => ['assigned', 'en_route', 'on_site', 'waiting_parts'].includes(j.status)) ?? jobs[0]
  const unread = notices.filter(n => n.unread).length
  const latestAssign = notices.find(n => n.unread && n.type === 'job.assigned')

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingHorizontal: padH, paddingBottom: 140 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>{me?.organization?.name ?? 'TOUR'}</Text>
            <Text style={styles.h1}>{tab === 'today' ? 'Heute' : tab === 'jobs' ? 'Einsätze' : tab === 'alerts' ? 'Post' : me?.name}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{jobs.length}</Text>
          </View>
        </View>

        {latestAssign && (
          <Pressable style={styles.assignBanner} onPress={() => markNotice(latestAssign)}>
            <Text style={styles.assignKicker}>NEUER EINSATZ</Text>
            <Text style={styles.assignTitle}>{latestAssign.title}</Text>
            <Text style={styles.assignBody}>{latestAssign.body}</Text>
          </Pressable>
        )}

        {tab === 'today' && next && (
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>Nächster Stopp</Text>
            <Text style={styles.heroTitle}>{next.title}</Text>
            <Text style={styles.muted}>{next.site?.address}</Text>
            <Text style={styles.muted}>{next.customer?.name}</Text>
            <Pipeline status={next.status} />
            <View style={styles.row}>
              <Pressable
                style={styles.split}
                onPress={() => next.site?.address && Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(next.site.address)}`)}>
                <Text style={styles.splitText}>Navigation</Text>
              </Pressable>
              <Pressable
                style={styles.splitGold}
                onPress={() => next.customer?.phone && Linking.openURL(`tel:${next.customer.phone}`)}>
                <Text style={styles.splitText}>Anrufen</Text>
              </Pressable>
            </View>
            <Action job={next} onGo={transition} />
          </View>
        )}

        {tab === 'today' && !next && (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Keine offenen Einsätze</Text>
            <Text style={styles.muted}>Neue Zuweisungen erscheinen hier sofort.</Text>
          </View>
        )}

        {(tab === 'today' || tab === 'jobs') && (
          <>
            {tab === 'today' && <Text style={styles.h2}>Tour</Text>}
            {jobs.map(job => (
              <Pressable
                key={job.id}
                style={[styles.card, open?.id === job.id && styles.cardOpen]}
                onPress={() => {
                  setOpen(job)
                  if (token) {
                    void api<Job>(`/api/v1/jobs/${job.id}`, token)
                      .then(detailed => setOpen(detailed))
                      .catch(() => {})
                  }
                }}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{job.title}</Text>
                  <Badge status={job.status} label={job.status_label} />
                </View>
                <Text style={styles.muted}>{job.site?.address}</Text>
              </Pressable>
            ))}
          </>
        )}

        {tab === 'alerts' && (
          <>
            {notices.map(n => (
              <Pressable key={n.id} style={[styles.card, n.unread && styles.unread]} onPress={() => markNotice(n)}>
                <Text style={styles.noticeType}>{n.type_label}</Text>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.muted}>{n.body}</Text>
              </Pressable>
            ))}
            {notices.length === 0 && <Text style={styles.muted}>Keine Mitteilungen.</Text>}
          </>
        )}

        {tab === 'me' && (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>{me?.name}</Text>
              <Text style={styles.muted}>{me?.organization?.name}</Text>
              <Pressable style={styles.ghost} onPress={logout}>
                <Text style={styles.ghostText}>Abmelden</Text>
              </Pressable>
            </View>
            <Text style={styles.h2}>Informationen</Text>
            <LegalLinks pages={pages} onOpen={openContent} stacked />
          </>
        )}
      </ScrollView>

      {open && tab !== 'me' && (
        <View style={[styles.sheet, { bottom: 56 + insets.bottom }]}>
          <ScrollView style={{ maxHeight: sheetMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.sheetKicker}>EINSATZ</Text>
            <Text style={[styles.heroTitle, compact && { fontSize: 20 }]}>{open.title}</Text>
            <Text style={styles.muted}>{open.site?.address}</Text>
            <Pipeline status={open.status} />
            <Action job={open} onGo={transition} />
            {['assigned', 'en_route', 'on_site', 'waiting_parts'].includes(open.status) && (
              <View style={{ marginTop: 14, gap: 10 }}>
                <Text style={styles.h2}>Erfassung</Text>
                <View style={styles.photoRow}>
                  <PhotoSlot
                    label="Vorher"
                    kind="before"
                    photos={open.photos}
                    busy={photoBusy === 'before'}
                    compact={compact}
                    onPress={() => uploadPhoto(open, 'before')}
                  />
                  <PhotoSlot
                    label="Nachher"
                    kind="after"
                    photos={open.photos}
                    busy={photoBusy === 'after'}
                    compact={compact}
                    onPress={() => uploadPhoto(open, 'after')}
                  />
                </View>
                <View style={styles.row}>
                  <Pressable style={[styles.ghost, { flex: 1, minHeight: 48 }]} onPress={() => startTime(open)}>
                    <Text style={styles.ghostText}>Zeit starten</Text>
                  </Pressable>
                  <Pressable style={[styles.ghost, { flex: 1, minHeight: 48 }]} onPress={() => stopTime(open)}>
                    <Text style={styles.ghostText}>Zeit stoppen</Text>
                  </Pressable>
                </View>
                {open.time_entries?.some(t => !t.ended_at) && (
                  <Text style={styles.success}>Zeiterfassung läuft…</Text>
                )}
                {catalog.length > 0 && (
                  <>
                    <Text style={styles.muted}>Material (+1)</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {catalog.slice(0, 6).map(item => (
                        <Pressable
                          key={item.public_id}
                          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' }}
                          onPress={() => addMaterial(open, item)}
                        >
                          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 12 }}>{item.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {(open.materials?.length ?? 0) > 0 && (
                  <Text style={styles.muted}>
                    {open.materials!.map(m => `${m.name ?? 'Pos.'} ×${m.quantity}`).join(' · ')}
                  </Text>
                )}
                <TextInput
                  style={styles.input}
                  placeholder="Unterschrift Name"
                  placeholderTextColor={colors.muted}
                  value={signerName}
                  onChangeText={setSignerName}
                />
                <Pressable style={[styles.ghost, { minHeight: 48 }]} onPress={() => signJob(open)}>
                  <Text style={styles.ghostText}>Unterschrift bestätigen</Text>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => setOpen(null)} style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }} hitSlop={8}>
              <Text style={styles.muted}>Schließen</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      <View style={[styles.tabBar, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TabItem label="Heute" on={tab === 'today'} onPress={() => { setTab('today'); setOpen(null) }} />
        <TabItem label="Tour" on={tab === 'jobs'} onPress={() => setTab('jobs')} />
        <TabItem label="Post" on={tab === 'alerts'} onPress={() => { setTab('alerts'); setOpen(null) }} badge={unread} />
        <TabItem label="Konto" on={tab === 'me'} onPress={() => { setTab('me'); setOpen(null) }} />
      </View>
    </SafeAreaView>
  )
}

function Pipeline({ status }: { status: string }) {
  const idx = Math.max(0, pipeline.findIndex(p => p.key === status))
  const waiting = status === 'waiting_parts'
  return (
    <View style={styles.pipe}>
      {pipeline.map((p, i) => (
        <View key={p.key} style={styles.pipeCol}>
          <View style={[styles.pipeDot, (waiting ? i <= 2 : i <= idx) && styles.pipeDotOn]} />
          <Text style={[styles.pipeLabel, p.key === status && styles.pipeLabelOn]}>{p.label}</Text>
        </View>
      ))}
    </View>
  )
}

function Action({ job, onGo }: { job: Job; onGo: (job: Job, status: string) => void }) {
  if (job.status === 'assigned') {
    return (
      <Pressable style={styles.cta} onPress={() => onGo(job, 'en_route')}>
        <Text style={styles.ctaText}>Einsatz starten</Text>
      </Pressable>
    )
  }
  if (job.status === 'en_route') {
    return (
      <Pressable style={styles.cta} onPress={() => onGo(job, 'on_site')}>
        <Text style={styles.ctaText}>Vor Ort angekommen</Text>
      </Pressable>
    )
  }
  if (job.status === 'on_site') {
    return (
      <View style={{ gap: 8, marginTop: 16 }}>
        <Pressable style={styles.cta} onPress={() => onGo(job, 'completed')}>
          <Text style={styles.ctaText}>Als erledigt markieren</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => onGo(job, 'waiting_parts')}>
          <Text style={styles.ghostText}>Wartet auf Teile</Text>
        </Pressable>
      </View>
    )
  }
  if (job.status === 'waiting_parts') {
    return (
      <View style={{ gap: 8, marginTop: 16 }}>
        <Pressable style={styles.cta} onPress={() => onGo(job, 'on_site')}>
          <Text style={styles.ctaText}>Wieder vor Ort</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => onGo(job, 'completed')}>
          <Text style={styles.ghostText}>Abschließen</Text>
        </Pressable>
      </View>
    )
  }
  if (job.status === 'completed') {
    return <Text style={styles.success}>Einsatz abgeschlossen — Büro kann rechnen.</Text>
  }
  return null
}

function Badge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone[status]
  return (
    <View style={[styles.badge, { backgroundColor: tone?.bg ?? colors.raised }]}>
      <Text style={[styles.badgeText, { color: tone?.fg ?? colors.muted }]}>{label || tone?.label || status}</Text>
    </View>
  )
}

function LegalLinks({
  pages,
  onOpen,
  stacked,
}: {
  pages: ContentPage[]
  onOpen: (slug: string) => void
  stacked?: boolean
}) {
  return (
    <View style={[styles.legalWrap, stacked && { flexDirection: 'column', alignItems: 'stretch', marginTop: 4 }]}>
      {pages.map(page => (
        <Pressable key={page.slug} onPress={() => onOpen(page.slug)} style={stacked ? styles.legalCard : styles.legalItem}>
          <Text style={stacked ? styles.legalCardTitle : styles.legalText}>{page.title}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function ContentReader({ page, onClose }: { page: ContentPage; onClose: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.legalText}>Zurück</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.kicker}>FIELDOPS</Text>
        <Text style={styles.h1}>{page.title}</Text>
        <PageBody body={page.body ?? ''} />
      </ScrollView>
    </SafeAreaView>
  )
}

function PageBody({ body }: { body: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      {body.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <Text key={i} style={styles.pageH}>
              {line.slice(3)}
            </Text>
          )
        }
        if (!line.trim()) {
          return <View key={i} style={{ height: 8 }} />
        }
        return (
          <Text key={i} style={styles.pageP}>
            {line}
          </Text>
        )
      })}
    </View>
  )
}

function TabItem({ label, on, onPress, badge }: { label: string; on: boolean; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} android_ripple={{ color: 'rgba(212,160,23,0.16)' }} style={styles.tabItem} onPress={onPress} hitSlop={8}>
      <View style={[styles.tabPip, on && styles.tabPipOn]} />
      <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

function PhotoSlot({
  label,
  kind,
  photos,
  busy,
  compact,
  onPress,
}: {
  label: string
  kind: 'before' | 'after'
  photos?: { id: string; kind?: string; url?: string }[]
  busy?: boolean
  compact?: boolean
  onPress: () => void
}) {
  const shot = [...(photos ?? [])].reverse().find(p => p.kind === kind)
  const height = compact ? 112 : 128
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}-Foto aufnehmen`}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.photoSlot,
        { height },
        pressed && { opacity: 0.9, borderColor: colors.gold },
        busy && { opacity: 0.7 },
      ]}
    >
      {shot?.url ? (
        <Image source={{ uri: shot.url }} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <View style={styles.photoEmpty}>
          <View style={styles.photoLens} />
          <Text style={styles.photoHint}>Tippen</Text>
        </View>
      )}
      <View style={styles.photoBadge}>
        {busy ? <ActivityIndicator color="#1A1408" size="small" /> : <Text style={styles.photoBadgeText}>{label}</Text>}
      </View>
    </Pressable>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FieldApp />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  auth: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  pad: { padding: 20, paddingBottom: 140 },
  goldBar: { width: 44, height: 5, borderRadius: 99, backgroundColor: colors.gold, marginBottom: 18 },
  kicker: { color: colors.gold, letterSpacing: 2.6, fontSize: 11, fontWeight: '700' },
  h1: { color: colors.ink, fontSize: 30, fontWeight: '700', marginTop: 6 },
  lead: { color: colors.muted, marginTop: 8, marginBottom: 20, lineHeight: 22 },
  h2: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  muted: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  input: { backgroundColor: colors.surface, color: colors.ink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 12, minHeight: 52, marginTop: 10, borderWidth: 1, borderColor: colors.line, fontSize: 16 },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 56,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: { color: '#1A1408', fontWeight: '800', fontSize: 16 },
  ghost: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.ink, fontWeight: '700' },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoSlot: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  photoFill: { ...StyleSheet.absoluteFillObject },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoLens: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  photoHint: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  photoBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 26,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadgeText: { color: '#1A1408', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  countPill: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.line },
  countText: { color: colors.gold, fontWeight: '700' },
  assignBanner: {
    backgroundColor: '#3F2E0C',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  assignKicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  assignTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 4 },
  assignBody: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  hero: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, ...cardShadow },
  heroKicker: { color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginTop: 10, borderWidth: 1, borderColor: colors.line, ...cardShadow },
  cardOpen: { borderColor: colors.gold },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  unread: { borderColor: colors.gold },
  noticeType: { color: colors.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  split: { flex: 1, backgroundColor: colors.navy, borderRadius: 14, padding: 14, alignItems: 'center' },
  splitGold: { flex: 1, backgroundColor: colors.gold, borderRadius: 14, padding: 14, alignItems: 'center' },
  splitText: { color: colors.ink, fontWeight: '700' },
  pipe: { flexDirection: 'row', marginTop: 16 },
  pipeCol: { flex: 1, alignItems: 'center' },
  pipeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.line, marginBottom: 6 },
  pipeDotOn: { backgroundColor: colors.gold },
  pipeLabel: { fontSize: 10, color: colors.muted },
  pipeLabelOn: { color: colors.ink, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  success: { color: colors.teal, fontWeight: '700', marginTop: 14 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    backgroundColor: colors.raised,
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetKicker: { color: colors.gold, letterSpacing: 2, fontSize: 11, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    paddingTop: 8,
    minHeight: 56,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  tabPip: { width: 18, height: 3, borderRadius: 99, backgroundColor: 'transparent' },
  tabPipOn: { backgroundColor: colors.gold },
  tabLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabLabelOn: { color: colors.ink },
  tabBadge: { position: 'absolute', right: 16, top: -2, backgroundColor: colors.rose, borderRadius: 8, minWidth: 16, paddingHorizontal: 4 },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  legalWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
  legalItem: { paddingVertical: 8, paddingHorizontal: 6 },
  legalText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  legalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  legalCardTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  pageH: { color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  pageP: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
