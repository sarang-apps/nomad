/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: BUSL-1.1
 */

import EmberObject, { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import RollingArray from 'nomad-ui/utils/classes/rolling-array';
import AbstractStatsTracker from 'nomad-ui/utils/classes/abstract-stats-tracker';
import classic from 'ember-classic-decorator';

const percent = (numerator, denominator) => {
  if (!numerator || !denominator) {
    return 0;
  }
  return numerator / denominator;
};

const empty = (ts) => ({ timestamp: ts, used: null, percent: null });

@classic
class NodeStatsTracker extends EmberObject.extend(AbstractStatsTracker) {
  // Set via the stats computed property macro
  node = null;

  @computed('node.id')
  get url() {
    return `/v1/client/stats?node_id=${this.get('node.id')}`;
  }

  append(frame) {
    console.log('frame: ', frame);
    // console.log("this.node", this.node);
    const timestamp = new Date(Math.floor(frame.Timestamp / 1000000));

    const cpuUsed = Math.floor(frame.CPUTicksConsumed) || 0;
    this.cpu.pushObject({
      timestamp,
      used: cpuUsed,
      percent: percent(cpuUsed, this.reservedCPU),
    });

    const memoryUsed = frame.Memory.Used;
    this.memory.pushObject({
      timestamp,
      used: memoryUsed,
      percent: percent(memoryUsed / 1024 / 1024, this.reservedMemory),
    });

    // GPU stats
    frame.DeviceStats.forEach((device) => {
      const gpuId = Object.keys(device.InstanceStats)[0];
      if (gpuId.toLowerCase().includes('gpu')) {
        const gpuStats = device.InstanceStats[gpuId].Stats;

        if (gpuStats) {
          // GPU Memory
          const data = {
            timestamp,
            used: gpuStats.Attributes['Memory state'].IntNumeratorVal,
            percent:
              gpuStats.Attributes['Memory state'].IntNumeratorVal /
              gpuStats.Attributes['Memory state'].IntDenominatorVal,
          };
          this.gpuMemory.pushObject(data);
          this.reservedGpuMemory =
            gpuStats.Attributes['Memory state'].IntDenominatorVal;

          // GPU utilization
          this.gpuUtil.pushObject({
            timestamp,
            percent:
              gpuStats.Attributes['GPU utilization'].IntNumeratorVal / 100,
          });

          // GPU Temperature
          this.gpuTemperature.pushObject({
            timestamp,
            percent: gpuStats.Attributes['Temperature'].IntNumeratorVal / 100,
          });
        } else {
          console.log(`No stats found for GPU with ID: ${gpuId}`);
        }
      }
      // console.log(typeof this.gpuMemory);
      // console.log('keys:', Object.keys(this.gpuMemory));
    });
  }

  pause() {
    const ts = new Date();
    this.memory.pushObject(empty(ts));
    this.cpu.pushObject(empty(ts));
  }

  // Static figures, denominators for stats
  @alias('node.resources.cpu') reservedCPU;
  @alias('node.resources.memory') reservedMemory;
  @alias('node.resources.gpuMemory') reservedGpuMemory;
  // Dynamic figures, collected over time
  // []{ timestamp: Date, used: Number, percent: Number }
  @computed('bufferSize', 'node')
  get cpu() {
    return RollingArray(this.bufferSize);
  }

  @computed('bufferSize', 'node')
  get memory() {
    return RollingArray(this.bufferSize);
  }

  @computed('bufferSize', 'node')
  get gpuMemory() {
    return RollingArray(this.bufferSize);
  }

  @computed('bufferSize', 'node')
  get gpuUtil() {
    return RollingArray(this.bufferSize);
  }

  @computed('bufferSize', 'node')
  get gpuTemperature() {
    return RollingArray(this.bufferSize);
  }
}

export default NodeStatsTracker;

export function stats(nodeProp, fetch) {
  return computed(nodeProp, function () {
    return NodeStatsTracker.create({
      fetch: fetch.call(this),
      node: this.get(nodeProp),
    });
  });
}
