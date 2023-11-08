import { toRaw }  from './index'
import { isIntegerKey } from './reactive';


export const ITERATE_KEY = Symbol('iterate')
const targetMap = new WeakMap();
let effectTrackDepth = 0;
let trackOpBit = 1;
const maxMarkerBits = 30;

let activeEffect;
const trackStack = []
let shouldTrack = true;

export class ReactiveEffect {
  active = true;
  deps = [];
  parent = undefined;
  fn;
  scheduler;

  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
  }

  run() {
    if (!this.active) {
      return this.fn();
    }
    let parent = activeEffect;
    while (parent) {
      if (parent === this) {
        return
      }
      parent = parent.parent
    }
    let lastShouldTrack = shouldTrack;
    try {
      this.parent = activeEffect;
      activeEffect = this;
      shouldTrack = true;

      trackOpBit = 1 << ++effectTrackDepth;

      return this.fn();
    } finally {
      trackOpBit = 1 << --effectTrackDepth;

      activeEffect = this.parent;
      shouldTrack = lastShouldTrack;
      this.parent = undefined;
    }
  }
}

export const createDep = (effects) => {
  const dep = new Set(effects);
  dep.w = 0;
  dep.n = 0;
  return dep;
};

export function track(target, type, key) {
  if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }
    trackEffects(dep)
  }
}


export function trackEffects(dep) {
  let shouldTrack = false;

  dep.add(activeEffect);
  activeEffect.deps.push(dep);
}

export function trackRefValue(ref) {
  if (shouldTrack && activeEffect) {
    ref = toRaw(ref);
    trackEffects(ref.dep || (ref.dep = createDep()));
  }
}

export function trigger (target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }
  let deps = []

  if (type === 'clear') {

  } else if (key === 'length' && Array.isArray(target)) {
    const newLength = Number(newValue)
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= newLength) {
        deps.push(dep)
      }
    })
  } else {
    if (key !== void 0) {
      deps.push(depsMap.get(key))
    }

    switch (type) {
      case 'add':
        if (!Array.isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
        } else if (isIntegerKey(key)) {
          deps.push(depsMap.get('length'))
        }
    }
  }

  if (deps.length === 1) {
    if (deps[0]) {
      triggerEffects(deps[0])
    }
  } else {
    const effects = []
    for (const dep of deps) {
      if (dep) {
        effects.push(...dep)
      }
    }
    triggerEffects(createDep(effects))
  }
}

export function triggerEffects(dep) {
  const effects = Array.isArray(dep) ? dep : [...dep];
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect);
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  }
}

export function triggerEffect (effect) {
    if (effect !== activeEffect) {
      if (effect.scheduler) {
        effect.scheduler()
      } else {
        effect.run()
      }
    }
}

export function triggerRefValue(ref, newVal) {
  ref = toRaw(ref);
  const dep = ref.dep;
  if (dep) {
    triggerEffects(dep);
  }
}


export function pauseTracking () {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}