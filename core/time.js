  // ------------------------------------------------------ Utility

  this.getTimeStamp = null

  if (typeof process === 'object') {
    const { PerformanceObserver, performance } = require('perf_hooks')
    this.getTimeStamp = () => {
      return performance.now()
    }
  } else {
    this.getTimeStamp = () => {
      return performance.now()
    }
  }
