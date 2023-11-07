const queue = [];
let isFlushing = false
let isFlushPending = false
const resolvedPromise = Promise.resolve()
let currentFlushPromise = null
let flushIndex = 0

export function queueJob(job) {
  if (!queue.length || !queue.includes(job)) {
    queue.push(job);
    queueFlush();
  }
}

function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

function flushJobs(seen) {
  isFlushPending = false
  isFlushing = true
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job && job.active !== false) {
        job()
      }
    }
  } finally {
    flushIndex = 0
    queue.length = 0
    isFlushing = false
    currentFlushPromise = null
  }
}