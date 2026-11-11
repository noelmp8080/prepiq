import { describe, it, expect } from 'vitest'
import {
  isISODate, planIsUpcoming, rotatePlanToStart, shiftDayKeys, planTodayIndex,
  planDatesWithStart, daysUntil, nextMonday, addDaysISO, startsInLabel, fromISO,
} from '../store/storeLogic'

const WEEK = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => ({ day, ids: [i + 1] }))
// 2026-11-11 is a Wednesday.
const WED = '2026-11-11'

describe('plan start date', () => {
  it('validates dates', () => {
    expect(isISODate('2026-11-16')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate(null)).toBe(false)
    expect(isISODate('11/16/2026')).toBe(false)
  })

  it('is upcoming only for a date after today', () => {
    expect(planIsUpcoming('2026-11-16', WED)).toBe(true)
    expect(planIsUpcoming(WED, WED)).toBe(false)
    expect(planIsUpcoming('2026-11-01', WED)).toBe(false)
    expect(planIsUpcoming(null, WED)).toBe(false)
  })

  it('rotates the week so the start day is day 0, meals staying with their day', () => {
    const { plan, shift } = rotatePlanToStart(WEEK, '2026-11-18')   // a Wednesday
    expect(shift).toBe(2)
    expect(plan.map(d => d.day)).toEqual(['Wed','Thu','Fri','Sat','Sun','Mon','Tue'])
    expect(plan[0].ids).toEqual([3])
  })

  it('leaves a Monday start alone', () => {
    const r = rotatePlanToStart(WEEK, '2026-11-16')
    expect(r.shift).toBe(0)
    expect(r.plan).toBe(WEEK)
  })

  it('carries grocery keys across a rotation', () => {
    const keys = new Set(['2:10', '0:11', '6:12'])
    expect([...shiftDayKeys(keys, 2, 7)].sort()).toEqual(['0:10', '4:12', '5:11'])
    expect(shiftDayKeys(keys, 0, 7)).toBe(keys)
  })

  it('has no today before the start, and the usual today after it', () => {
    expect(planTodayIndex(WEEK, '2026-11-16', fromISO(WED))).toBe(-1)
    expect(planTodayIndex(WEEK, null, fromISO(WED))).toBe(2)
    expect(planTodayIndex(WEEK, '2026-11-16', fromISO('2026-11-19'))).toBe(3)
  })

  it('dates the plan from the start while upcoming', () => {
    expect(planDatesWithStart(7, -1, '2026-11-16', fromISO(WED)))
      .toEqual(['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22'])
    expect(planDatesWithStart(7, 2, null, fromISO(WED))[0]).toBe('2026-11-09')
  })

  it('crosses month and year ends', () => {
    expect(planDatesWithStart(7, -1, '2026-12-29', fromISO(WED))[6]).toBe('2027-01-04')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('counts days and finds next Monday', () => {
    expect(daysUntil('2026-11-16', WED)).toBe(5)
    expect(nextMonday(WED)).toBe('2026-11-16')
    expect(nextMonday('2026-11-16')).toBe('2026-11-23')   // a Monday asks for the next one
    expect(nextMonday('2026-11-15')).toBe('2026-11-16')   // Sunday
    expect(startsInLabel('2026-11-12', WED)).toBe('STARTS TOMORROW')
    expect(startsInLabel('2026-11-16', WED)).toBe('STARTS IN 5 DAYS')
  })
})
