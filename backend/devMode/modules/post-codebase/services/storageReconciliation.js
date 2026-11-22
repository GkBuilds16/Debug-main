import Codebase from '../../models/Codebase.js';
import CodebaseVersion from '../../models/CodebaseVersion.js';
import DevBattleWorkspace from '../../models/DevBattleWorkspace.js';
import DevBattleSubmission from '../../models/DevBattleSubmission.js';
import { providerForReference, storageProvider, storageProviderName } from './storage.js';

const referencesFrom = value => (value || []).filter(file => file?.storageKey).map(file => ({
  storageProvider: file.storageProvider || 'local',
  storageKey: file.storageKey
}));

export async function inventoryStorage() {
  const [codebases, versions, workspaces, submissions] = await Promise.all([
    Codebase.find({}).select('+files.storageKey').lean(),
    CodebaseVersion.find({}).select('+snapshot').lean(),
    DevBattleWorkspace.find({}).select('+files.storageKey').lean(),
    DevBattleSubmission.find({}).select('+files.storageKey').lean()
  ]);
  const active = [
    ...codebases.flatMap(row => referencesFrom(row.files)),
    ...versions.flatMap(row => referencesFrom(row.snapshot?.files)),
    ...workspaces.flatMap(row => referencesFrom(row.files)),
    ...submissions.flatMap(row => referencesFrom(row.files))
  ];
  const activeKeys = new Set(active.map(ref => `${ref.storageProvider}:${ref.storageKey}`));
  const objects = storageProvider.list ? await storageProvider.list() : [];
  const listed = objects.map(storageKey => ({ storageProvider: storageProviderName, storageKey }));
  const missingReferenced = (await Promise.all(active.map(async ref => {
    const provider = providerForReference(ref);
    return provider && await provider.exists(ref.storageKey) ? null : ref;
  }))).filter(Boolean);
  const orphanCandidates = listed.filter(ref => !activeKeys.has(`${ref.storageProvider}:${ref.storageKey}`));
  return {
    dryRun: true,
    activeReferences: active.length,
    listedObjects: listed.length,
    missingReferenced,
    orphanCandidates
  };
}
