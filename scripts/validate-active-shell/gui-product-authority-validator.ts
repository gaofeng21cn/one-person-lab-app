import { assertIncludesAll } from './assertions.ts';

export function validateGuiProductAuthority(productAuthority) {
  const shellUpgradePolicy = productAuthority.shell_upgrade_policy;
  if (shellUpgradePolicy?.role !== 'replaceable_implementation_carrier') {
    throw new Error('App GUI product contract must treat shell upgrades as replaceable implementation carrier work');
  }
  assertIncludesAll(
    shellUpgradePolicy.app_repo_controls,
    [
      'settings information architecture',
      'home command center requirements',
      'page-state acceptance matrix',
      'release and screenshot evidence gates',
    ],
    'App GUI shell upgrade policy app repo controls',
  );
  assertIncludesAll(
    shellUpgradePolicy.shell_repo_controls,
    [
      'renderer implementation details',
      'pinned upstream DSH compatibility deltas',
      'shell-local tests proving App contract implementation',
    ],
    'App GUI shell upgrade policy shell repo controls',
  );
  const forkDeltaBudget = shellUpgradePolicy.fork_delta_budget;
  if (forkDeltaBudget?.policy !== 'app_contract_first_thin_shell_delta') {
    throw new Error('App GUI shell upgrade policy must keep fork delta App-contract-first and thin');
  }
  assertIncludesAll(
    forkDeltaBudget.preferred_optimization_path,
    [
      'encode product behavior in App contracts and product profile',
      'project App state/action refs through adapter bridge',
      'compose existing shell components before introducing new shell-owned flows',
      'keep upstream route compatibility as redirects instead of ordinary tabs',
      'prove behavior with App-root validation and shell-local focused tests',
    ],
    'App GUI fork delta preferred optimization path',
  );
  assertIncludesAll(
    forkDeltaBudget.allowed_shell_delta,
    [
      'generated product profile reader',
      'route and tab compatibility redirects',
      'thin renderer components for App-owned pages',
      'App state/action bridge calls',
      'shell-local styling and i18n needed to render App contract',
      'package and smoke hooks',
    ],
    'App GUI fork delta allowed shell changes',
  );
  assertIncludesAll(
    forkDeltaBudget.requires_app_contract_before_shell_change,
    [
      'new ordinary Settings tab',
      'new Home surface',
      'new capability or purpose entry',
      'new runtime/action truth source',
      'new visible model/provider/permission control',
      'new first-run gate',
    ],
    'App GUI fork delta App-contract-before-shell-change rules',
  );
  assertIncludesAll(
    forkDeltaBudget.forbidden_shell_delta,
    [
      'shell-owned product IA',
      'shell-owned runtime/domain truth',
      'fork-local model/provider policy',
      'deep rewrites of upstream shell core without App contract and adoption gate',
      'copying external UI source into shell without license and candidate decision',
    ],
    'App GUI fork delta forbidden shell changes',
  );
  if (
    forkDeltaBudget.replacement_rule !==
    'a candidate shell should implement the same App contracts by swapping adapters/profile consumers, not by inheriting shell-specific product logic'
  ) {
    throw new Error('App GUI fork delta budget must keep shell replacement adapter/profile driven');
  }
  if (
    shellUpgradePolicy.upgrade_rule !==
    'apply upstream shell updates only after checking the delta against App-owned contracts; upstream defaults can be implementation material but never product authority'
  ) {
    throw new Error('App GUI shell upgrade policy must keep upstream defaults out of product authority');
  }
  if (
    shellUpgradePolicy.replacement_rule !==
    'new shells remain candidate implementations until App-owned contracts, page-state matrix, first-run matrix, active-shell validation, and package compile pass'
  ) {
    throw new Error('App GUI shell replacement rule must require App-owned gates before adoption');
  }
}
