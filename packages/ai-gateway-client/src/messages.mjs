// User-facing messages from the ADS Agentic and RAG Integration Standard v1 §4 and §10.1.
// Products may use their own wording if it means the same thing.
export const MESSAGES = {
  en: {
    loading: 'Checking sources…',
    aiLabel: 'AI-assisted, from the sources below',
    draftLabel: 'Draft — needs your approval',
    testMode: 'Test mode — sources are test documents',
    insufficient: "I can't answer this reliably from our sources.",
    denied: "You don't have access to this.",
    rateLimited: 'Too many requests, try again in a moment.',
    unavailable: 'This assistant is not available right now.',
  },
  fr: {
    loading: 'Vérification des sources…',
    aiLabel: "Assisté par IA, d'après les sources ci-dessous",
    draftLabel: 'Brouillon — à valider',
    testMode: 'Mode test — sources de test',
    insufficient: 'Je ne peux pas répondre de façon fiable à partir de nos sources.',
    denied: "Vous n'avez pas accès à cette fonction.",
    rateLimited: 'Trop de demandes, réessayez dans un instant.',
    unavailable: "Cet assistant n'est pas disponible pour le moment.",
  },
};
