# Politique de confidentialité — TeamPulse

**Dernière mise à jour : 19 septembre 2026**

TeamPulse est une messagerie destinée aux équipes en entreprise. Ce document
décrit les données que l'application collecte, ce qu'elle en fait, et comment
les supprimer.

> **À compléter avant publication.** Les mentions entre crochets doivent être
> remplacées par vos informations réelles : elles engagent juridiquement
> l'éditeur et Google Play vérifie qu'un contact valide figure ici.

**Responsable du traitement :** [Raison sociale ou nom de l'éditeur]
**Adresse :** [Adresse postale]
**Contact :** [adresse e-mail de contact]

---

## 1. Données collectées

**Données de compte**, que vous fournissez à l'inscription :

| Donnée | Usage | Obligatoire |
|---|---|---|
| Nom | Vous identifier auprès de vos collègues | Oui |
| Adresse e-mail | Connexion, vérification du compte, invitations | Oui |
| Mot de passe | Authentification — stocké haché (bcrypt), jamais en clair | Oui |
| Photo de profil | Affichage dans les conversations | Non |
| Numéro de téléphone | Visible par les membres de votre organisation | Non |

**Contenus que vous produisez :** messages texte, images, fichiers et messages
vocaux envoyés dans vos conversations, ainsi que l'historique de vos appels
(interlocuteur, date, durée — **le contenu des appels n'est ni enregistré ni
transmis à nos serveurs**, les flux audio et vidéo circulent directement entre
les participants).

**Données techniques :** un jeton de notification propre à votre appareil, et
votre état de connexion (en ligne / hors ligne).

L'application **ne collecte pas** votre position, vos contacts, votre carnet
d'adresses, ni aucun identifiant publicitaire. Elle ne contient ni publicité ni
traceur tiers à des fins de mesure d'audience.

## 2. Usage

Vos données servent exclusivement à faire fonctionner le service : acheminer
vos messages, vous authentifier, vous notifier, et vous afficher dans
l'annuaire de votre organisation.

**Elles ne sont ni vendues, ni louées, ni cédées à des tiers**, et ne servent
pas à de la publicité ciblée.

## 3. Qui peut voir vos données

**Les membres de votre organisation** voient votre nom, votre photo, votre
adresse e-mail, votre téléphone si vous l'avez renseigné, et votre état de
connexion. Vos messages sont visibles des participants des conversations
concernées.

**Le cloisonnement est strict :** les membres d'une autre organisation ne
peuvent ni vous trouver dans l'annuaire, ni consulter votre profil, ni ouvrir
une conversation avec vous.

**Les administrateurs de votre organisation** peuvent consulter l'annuaire,
modifier les rôles et désactiver un compte. Ils **n'ont pas** accès au contenu
de vos conversations privées.

## 4. Sous-traitants

| Prestataire | Rôle | Données transmises |
|---|---|---|
| [Hébergeur — Railway] | Hébergement de l'application et de la base | Toutes les données du service |
| Cloudinary | Stockage des images et fichiers partagés | Fichiers que vous envoyez |
| Brevo | Envoi des e-mails (codes de vérification, invitations) | Adresse e-mail, nom |
| Expo / Google (FCM) | Notifications push | Jeton d'appareil, titre et aperçu du message |

## 5. Conservation

Vos données sont conservées tant que votre compte existe. Après suppression,
il subsiste ce qui est décrit au point 6.

Les codes de vérification à usage unique expirent au bout de 10 minutes, les
invitations non utilisées au bout de 7 jours.

## 6. Supprimer votre compte

**Depuis l'application :** Réglages → Paramètres du compte → **Supprimer mon
compte**. Votre mot de passe vous est redemandé pour confirmer.

**Sans l'application :** écrivez à [adresse e-mail de contact] depuis l'adresse
associée à votre compte. La demande est traitée sous 30 jours.

**Ce qui est effacé immédiatement et définitivement :** votre nom, votre
adresse e-mail, votre mot de passe, votre photo, votre numéro de téléphone,
vos jetons de notification et vos conversations épinglées. Le compte devient
inutilisable et disparaît de l'annuaire.

**Ce qui subsiste :** les messages que vous avez déjà envoyés restent dans les
conversations de leurs destinataires, dissociés de votre identité et attribués
à « Compte supprimé ». Ces messages font partie des échanges de vos
interlocuteurs : les effacer reviendrait à amputer leurs conversations. Si
vous souhaitez en retirer certains, supprimez-les pour tout le monde
**avant** de supprimer votre compte.

Si vous êtes responsable d'une organisation comptant d'autres membres, vous
devez d'abord transférer ce rôle : sans cela l'organisation se retrouverait
sans administrateur.

## 7. Vos droits

Conformément au RGPD, vous disposez d'un droit d'accès, de rectification,
d'effacement, de limitation, d'opposition et de portabilité. Le nom, la photo
et le téléphone se modifient directement dans les Réglages. Pour toute autre
demande, écrivez à [adresse e-mail de contact].

Vous pouvez introduire une réclamation auprès de l'autorité de protection des
données compétente.

## 8. Sécurité

Les échanges avec le serveur passent par HTTPS. Les mots de passe sont hachés
avec bcrypt. L'accès à l'API exige un jeton signé, vérifié en base à chaque
requête : la désactivation d'un compte prend effet immédiatement, sans
attendre l'expiration du jeton.

Aucun système n'est infaillible : nous ne pouvons pas garantir une sécurité
absolue.

## 9. Mineurs

Le service s'adresse à un usage professionnel et n'est pas destiné aux moins
de 16 ans.

## 10. Modifications

Toute évolution de cette politique sera publiée ici, avec mise à jour de la
date en tête de document.
