import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useAuthStore } from '../../store/useAuthStore';
import {
  OrgMember,
  changeMemberRole,
  getInvitations,
  getMembers,
  getOrganization,
  inviteMember,
  revokeInvitation,
  setMemberActive,
  transferOwnership,
  updateOrganization,
} from '../../services/organizations';
import { Invitation, Organization, OrgRole, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Responsable',
  admin: 'Administrateur',
  member: 'Membre',
};

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || fallback;

function RoleBadge({ role }: { role: OrgRole }) {
  const tone =
    role === 'owner'
      ? 'bg-primary-600'
      : role === 'admin'
        ? 'bg-primary-100 dark:bg-primary-900'
        : 'bg-surface-chip dark:bg-dark-200';
  const text =
    role === 'owner'
      ? 'text-white'
      : role === 'admin'
        ? 'text-primary-800 dark:text-primary-200'
        : 'text-ink-500 dark:text-slate-400';
  return (
    <View className={`px-2 py-0.5 rounded-full ${tone}`}>
      <Text className={`text-[11px] font-bold ${text}`}>{ROLE_LABEL[role]}</Text>
    </View>
  );
}

export default function OrganizationScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const currentUser = useAuthStore((s) => s.user);
  const myRole = (currentUser?.role ?? 'member') as OrgRole;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviting, setInviting] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([getOrganization(), getMembers()]);
      setOrg(o);
      setMembers(m);
      // Réservé aux administrateurs : un membre recevrait un 403.
      if (isAdmin) setInvitations(await getInvitations());
    } catch (err: any) {
      Alert.alert('Erreur', errorMessage(err, 'Chargement impossible'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      Alert.alert('Adresse invalide', 'Saisissez une adresse e-mail valide.');
      return;
    }
    setInviting(true);
    try {
      await inviteMember(email, inviteRole);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('member');
      setInvitations(await getInvitations());
      Alert.alert(
        'Invitation envoyée',
        `${email} recevra un code pour rejoindre ${org?.name ?? 'l’organisation'}.`,
      );
    } catch (err: any) {
      Alert.alert('Erreur', errorMessage(err, 'Invitation impossible'));
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = (invitation: Invitation) => {
    Alert.alert('Révoquer l’invitation', invitation.email, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révoquer',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInvitation(invitation.id);
            setInvitations((list) =>
              list.filter((i) => i.id !== invitation.id),
            );
          } catch (err: any) {
            Alert.alert('Erreur', errorMessage(err, 'Révocation impossible'));
          }
        },
      },
    ]);
  };

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
      await load();
    } catch (err: any) {
      Alert.alert('Erreur', errorMessage(err, fallback));
    }
  };

  const openMemberActions = (member: OrgMember) => {
    if (!isAdmin || member.id === currentUser?.id) return;

    const actions: Parameters<typeof Alert.alert>[2] = [
      { text: 'Annuler', style: 'cancel' },
    ];

    if (member.role !== 'owner') {
      actions.push(
        member.role === 'admin'
          ? {
              text: 'Rétrograder en membre',
              onPress: () =>
                run(
                  () => changeMemberRole(member.id, 'member'),
                  'Changement de rôle impossible',
                ),
            }
          : {
              text: 'Promouvoir administrateur',
              onPress: () =>
                run(
                  () => changeMemberRole(member.id, 'admin'),
                  'Changement de rôle impossible',
                ),
            },
      );

      if (isOwner && member.isActive) {
        actions.push({
          text: 'Transférer la responsabilité',
          onPress: () =>
            Alert.alert(
              'Transférer la responsabilité',
              `${member.name} deviendra responsable et vous redeviendrez administrateur. Cette action est irréversible sans son accord.`,
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Transférer',
                  style: 'destructive',
                  onPress: () =>
                    run(
                      () => transferOwnership(member.id),
                      'Transfert impossible',
                    ),
                },
              ],
            ),
        });
      }

      actions.push(
        member.isActive
          ? {
              text: 'Désactiver le compte',
              style: 'destructive',
              onPress: () =>
                run(
                  () => setMemberActive(member.id, false),
                  'Désactivation impossible',
                ),
            }
          : {
              text: 'Réactiver le compte',
              onPress: () =>
                run(
                  () => setMemberActive(member.id, true),
                  'Réactivation impossible',
                ),
            },
      );
    }

    Alert.alert(member.name, member.email, actions);
  };

  // Modale plutôt qu'Alert.prompt : ce dernier n'existe que sur iOS et ne
  // ferait rien du tout sur Android.
  const openRename = () => {
    if (!isAdmin || !org) return;
    setRenameValue(org.name);
    setRenameOpen(true);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      await updateOrganization({ name });
      setRenameOpen(false);
      await load();
    } catch (err: any) {
      Alert.alert('Erreur', errorMessage(err, 'Renommage impossible'));
    } finally {
      setRenaming(false);
    }
  };

  const activeCount = members.filter((m) => m.isActive).length;

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      <View
        className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg flex-1">
          Organisation
        </Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => setInviteOpen(true)} activeOpacity={0.7}>
            <Ionicons name="person-add" size={22} color={headerAccent} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* En-tête organisation */}
          <TouchableOpacity
            activeOpacity={isAdmin ? 0.7 : 1}
            onPress={openRename}
            className="mx-4 mt-4 bg-surface-card dark:bg-dark-100 rounded-2xl p-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-2xl bg-primary-600 items-center justify-center mr-3">
              <Text className="text-white text-lg font-bold">
                {(org?.name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-ink-900 dark:text-white text-lg font-bold">
                {org?.name}
              </Text>
              <Text className="text-ink-400 dark:text-slate-400 text-sm mt-0.5">
                {activeCount} membre{activeCount > 1 ? 's' : ''} actif
                {activeCount > 1 ? 's' : ''}
                {members.length !== activeCount
                  ? ` · ${members.length - activeCount} désactivé${members.length - activeCount > 1 ? 's' : ''}`
                  : ''}
              </Text>
            </View>
            {isAdmin && <Ionicons name="pencil" size={16} color={mutedIcon} />}
          </TouchableOpacity>

          {org?.allowedDomains?.length ? (
            <View className="mx-4 mt-3 bg-surface-card dark:bg-dark-100 rounded-2xl p-4">
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mb-2">
                DOMAINES AUTORISÉS
              </Text>
              <Text className="text-ink-700 dark:text-slate-200 text-sm">
                {org.allowedDomains.join(', ')}
              </Text>
              <Text className="text-ink-400 dark:text-slate-400 text-xs mt-2">
                Toute adresse de ces domaines rejoint l’organisation sans invitation.
              </Text>
            </View>
          ) : null}

          {/* Invitations en attente */}
          {isAdmin && invitations.length > 0 && (
            <>
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mt-5 mb-2">
                INVITATIONS EN ATTENTE
              </Text>
              <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden">
                {invitations.map((inv, i) => (
                  <TouchableOpacity
                    key={inv.id}
                    activeOpacity={0.7}
                    onPress={() => handleRevoke(inv)}
                    className={`flex-row items-center px-4 py-3 ${
                      i > 0
                        ? 'border-t border-ink-200/40 dark:border-slate-700/50'
                        : ''
                    }`}
                  >
                    <Ionicons name="mail-outline" size={18} color={mutedIcon} />
                    <View className="flex-1 ml-3">
                      <Text
                        className="text-ink-900 dark:text-white text-sm font-medium"
                        numberOfLines={1}
                      >
                        {inv.email}
                      </Text>
                      <Text className="text-ink-400 dark:text-slate-400 text-xs mt-0.5">
                        {ROLE_LABEL[inv.role]} · code {inv.token.slice(0, 8)}…
                      </Text>
                    </View>
                    <Ionicons name="close-circle" size={20} color="#dc2626" />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Annuaire */}
          <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mt-5 mb-2">
            MEMBRES
          </Text>
          <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden">
            {members.map((m, i) => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={isAdmin && m.id !== currentUser?.id ? 0.7 : 1}
                onPress={() => openMemberActions(m)}
                className={`flex-row items-center px-4 py-3 ${
                  i > 0 ? 'border-t border-ink-200/40 dark:border-slate-700/50' : ''
                } ${m.isActive ? '' : 'opacity-50'}`}
              >
                <View className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
                  {m.avatar ? (
                    <Image
                      source={{ uri: m.avatar }}
                      className="w-10 h-10"
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Text className="text-primary-700 dark:text-primary-300 font-bold">
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center">
                    <Text
                      className="text-ink-900 dark:text-white font-semibold flex-shrink"
                      numberOfLines={1}
                    >
                      {m.name}
                    </Text>
                    {m.id === currentUser?.id && (
                      <Text className="text-ink-400 dark:text-slate-400 text-xs ml-1">
                        (vous)
                      </Text>
                    )}
                  </View>
                  <Text
                    className="text-ink-400 dark:text-slate-400 text-xs mt-0.5"
                    numberOfLines={1}
                  >
                    {m.isActive ? m.email : 'Compte désactivé'}
                  </Text>
                </View>
                <RoleBadge role={m.role} />
              </TouchableOpacity>
            ))}
          </View>

          {!isAdmin && (
            <Text className="text-ink-400 dark:text-slate-400 text-xs mx-6 mt-4">
              Seuls les administrateurs peuvent inviter, changer les rôles ou
              désactiver un compte.
            </Text>
          )}
        </ScrollView>
      )}

      {/* Renommage */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-surface-card dark:bg-dark-300 rounded-2xl w-full p-5">
            <Text className="text-ink-900 dark:text-white font-bold text-lg mb-4">
              Nom de l’organisation
            </Text>
            <TextInput
              className="bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-3 text-base"
              placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={60}
              autoFocus
            />
            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                onPress={() => setRenameOpen(false)}
                className="px-4 py-2.5 mr-2"
              >
                <Text className="text-ink-500 dark:text-slate-300 font-semibold">
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRename}
                disabled={renaming}
                activeOpacity={0.85}
                className="bg-primary-600 rounded-full px-5 py-2.5 items-center justify-center"
              >
                {renaming ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invitation */}
      <Modal
        visible={inviteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteOpen(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-surface-card dark:bg-dark-300 rounded-2xl w-full p-5">
            <Text className="text-ink-900 dark:text-white font-bold text-lg mb-1">
              Inviter un collègue
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm mb-4">
              Il recevra un code valable 7 jours, utilisable uniquement avec
              cette adresse.
            </Text>

            <TextInput
              className="bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-3 text-base"
              placeholder="collegue@entreprise.com"
              placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />

            <View className="flex-row bg-surface-chip dark:bg-dark-100 rounded-2xl p-1 mt-3">
              {(['member', 'admin'] as const).map((r) => {
                const active = inviteRole === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setInviteRole(r)}
                    activeOpacity={0.8}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      active ? 'bg-primary-600' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-white' : 'text-ink-700 dark:text-slate-200'
                      }`}
                    >
                      {ROLE_LABEL[r]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                onPress={() => setInviteOpen(false)}
                className="px-4 py-2.5 mr-2"
              >
                <Text className="text-ink-500 dark:text-slate-300 font-semibold">
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleInvite}
                disabled={inviting}
                activeOpacity={0.85}
                className="bg-primary-600 rounded-full px-5 py-2.5 items-center justify-center"
              >
                {inviting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Inviter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
