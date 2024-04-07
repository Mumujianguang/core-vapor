import { type IfAny, isArray } from '@vue/shared'
import { baseWatch } from '@vue/reactivity'
import { type ComponentInternalInstance, setCurrentInstance } from './component'
import type { Block } from './apiRender'
import { createVaporPreScheduler } from './scheduler'

// TODO: SSR

export type Slot<T extends any = any> = (
  ...args: IfAny<T, any[], [T] | (T extends undefined ? [] : never)>
) => Block

export type InternalSlots = {
  [name: string]: Slot | undefined
}

export type Slots = Readonly<InternalSlots>

export interface DynamicSlot {
  name: string
  fn: Slot
  key?: string
}

export type DynamicSlots = () => (DynamicSlot | DynamicSlot[])[]

export const initSlots = (
  instance: ComponentInternalInstance,
  rawSlots: InternalSlots | null = null,
  dynamicSlots: DynamicSlots | null = null,
) => {
  const slots: InternalSlots = {}

  for (const key in rawSlots) {
    const slot = rawSlots[key]
    if (slot) {
      slots[key] = withCtx(slot)
    }
  }

  if (dynamicSlots) {
    const dynamicSlotKeys: Record<string, true> = {}
    baseWatch(
      () => {
        const _dynamicSlots = dynamicSlots()
        for (let i = 0; i < _dynamicSlots.length; i++) {
          const slot = _dynamicSlots[i]
          // array of dynamic slot generated by <template v-for="..." #[...]>
          if (isArray(slot)) {
            for (let j = 0; j < slot.length; j++) {
              slots[slot[j].name] = withCtx(slot[j].fn)
              dynamicSlotKeys[slot[j].name] = true
            }
          } else if (slot) {
            // conditional single slot generated by <template v-if="..." #foo>
            slots[slot.name] = withCtx(
              slot.key
                ? (...args: any[]) => {
                    const res = slot.fn(...args)
                    // attach branch key so each conditional branch is considered a
                    // different fragment
                    if (res) (res as any).key = slot.key
                    return res
                  }
                : slot.fn,
            )
            dynamicSlotKeys[slot.name] = true
          }
        }
        // delete stale slots
        for (const key in dynamicSlotKeys) {
          if (
            !_dynamicSlots.some(slot =>
              isArray(slot)
                ? slot.some(s => s.name === key)
                : slot?.name === key,
            )
          ) {
            delete slots[key]
          }
        }
      },
      undefined,
      { scheduler: createVaporPreScheduler(instance) },
    )
  }

  instance.slots = slots

  function withCtx(fn: Slot): Slot {
    return (...args: any[]) => {
      const reset = setCurrentInstance(instance.parent!)
      try {
        return fn(...args)
      } finally {
        reset()
      }
    }
  }
}