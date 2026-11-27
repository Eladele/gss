import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../app/theme/app_theme.dart';
import '../../core/errors/app_exception.dart';
import '../../domain/usecases/usecases.dart';
import '../session/marque_controller.dart';
import '../session/session_controller.dart';

class ConnexionController extends GetxController {
  ConnexionController(this._connecter, this._session);

  final Connecter _connecter;
  final SessionController _session;

  final nom = TextEditingController();
  final motDePasse = TextEditingController();
  final RxBool chargement = false.obs;
  final RxBool masquer = true.obs;
  final RxnString erreur = RxnString();

  Future<void> valider() async {
    if (chargement.value) return;
    erreur.value = null;
    chargement.value = true;
    try {
      final u = await _connecter(nom.text, motDePasse.text);
      await _session.ouvrir(u);
    } catch (e) {
      erreur.value = messageErreur(e, 'Connexion impossible');
    } finally {
      chargement.value = false;
    }
  }

  @override
  void onClose() {
    nom.dispose();
    motDePasse.dispose();
    super.onClose();
  }
}

class ConnexionPage extends GetView<ConnexionController> {
  const ConnexionPage({super.key});

  @override
  Widget build(BuildContext context) {
    final large = MediaQuery.sizeOf(context).width >= 900;
    final formulaire = _Formulaire(c: controller);
    return Scaffold(
      backgroundColor: large ? Couleurs.fond : Colors.white,
      body: SafeArea(
        child: large
            ? Row(
                children: [
                  const Expanded(child: _Presentation()),
                  Expanded(child: Center(child: SizedBox(width: 420, child: Card(child: Padding(padding: const EdgeInsets.all(28), child: formulaire))))),
                ],
              )
            : Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440), child: formulaire),
                ),
              ),
      ),
    );
  }
}

class _Presentation extends StatelessWidget {
  const _Presentation();

  @override
  Widget build(BuildContext context) {
    final m = Get.find<MarqueController>();
    return Obx(() => Container(
          color: Couleurs.ardoise,
          padding: const EdgeInsets.all(48),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
                child: const LogoMarque(hauteur: 56),
              ),
              const SizedBox(height: 20),
              Text(m.marque.value.nom.toUpperCase(),
                  style: TextStyle(color: m.couleurSecondaire, letterSpacing: 3, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              Text(
                m.marque.value.nomComplet.isEmpty ? 'Le programme du jour,\nmême sans réseau.' : m.marque.value.nomComplet,
                style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, height: 1.15),
              ),
              const SizedBox(height: 16),
              const Text(
                'Programme, surveillance, caisses, congés et paie — même sans réseau : vos actions partent toutes seules au retour de la connexion.',
                style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 17, height: 1.4),
              ),
            ],
          ),
        ));
  }
}

class _Formulaire extends StatelessWidget {
  const _Formulaire({required this.c});

  final ConnexionController c;

  @override
  Widget build(BuildContext context) {
    return AutofillGroup(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(alignment: Alignment.centerLeft, child: LogoMarque(hauteur: 64)),
          const SizedBox(height: 20),
          const Text('Connexion', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Couleurs.encre)),
          const SizedBox(height: 4),
          Obx(() {
            final m = Get.find<MarqueController>().marque.value;
            return Text(m.slogan.isEmpty ? m.nomComplet : m.slogan, style: const TextStyle(color: Couleurs.texte));
          }),
          const SizedBox(height: 24),
          TextField(
            controller: c.nom,
            autofillHints: const [AutofillHints.username],
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Nom d’utilisateur', prefixIcon: Icon(Icons.person_outline_rounded)),
          ),
          const SizedBox(height: 12),
          Obx(() => TextField(
                controller: c.motDePasse,
                obscureText: c.masquer.value,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => c.valider(),
                decoration: InputDecoration(
                  labelText: 'Mot de passe',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    icon: Icon(c.masquer.value ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => c.masquer.toggle(),
                  ),
                ),
              )),
          Obx(() => c.erreur.value == null
              ? const SizedBox(height: 20)
              : Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(c.erreur.value!, style: const TextStyle(color: Couleurs.rouge, fontWeight: FontWeight.w600)),
                )),
          Obx(() => FilledButton(
                onPressed: c.chargement.value ? null : c.valider,
                child: c.chargement.value
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : const Text('Se connecter'),
              )),
        ],
      ),
    );
  }
}
