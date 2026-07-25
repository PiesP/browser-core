import { describe, expect, it } from 'vitest';
import { PriorityBucketQueue } from '../../src/util/priority-queue.js';

describe('PriorityBucketQueue', () => {
  it('enqueues and dequeues in priority order', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('low', 3);
    queue.enqueue('high', 1);
    queue.enqueue('medium', 2);
    expect(queue.dequeue()).toBe('high');
    expect(queue.dequeue()).toBe('medium');
    expect(queue.dequeue()).toBe('low');
  });

  it('returns undefined when queue is empty', () => {
    const queue = new PriorityBucketQueue<string>();
    expect(queue.dequeue()).toBeUndefined();
  });

  it('peek() returns without removing', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('a', 2);
    queue.enqueue('b', 1);
    expect(queue.peek()).toBe('b');
    expect(queue.peek()).toBe('b'); // still there
    expect(queue.size).toBe(2);
  });

  it('maintains FIFO within same priority', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('first', 1);
    queue.enqueue('second', 1);
    queue.enqueue('third', 1);
    expect(queue.dequeue()).toBe('first');
    expect(queue.dequeue()).toBe('second');
    expect(queue.dequeue()).toBe('third');
  });

  it('size tracks total entries', () => {
    const queue = new PriorityBucketQueue<string>();
    expect(queue.size).toBe(0);
    queue.enqueue('a', 1);
    expect(queue.size).toBe(1);
    queue.enqueue('b', 2);
    expect(queue.size).toBe(2);
    queue.dequeue();
    expect(queue.size).toBe(1);
  });

  it('forEach iterates in priority order', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('c', 3);
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    const items: string[] = [];
    queue.forEach((item) => items.push(item));
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('handles all priority levels', () => {
    const queue = new PriorityBucketQueue<string>();
    for (let p = 10; p >= 1; p--) queue.enqueue(`p${p}`, p);
    for (let p = 1; p <= 10; p++) {
      expect(queue.dequeue()).toBe(`p${p}`);
    }
  });

  it('handles empty buckets at high priorities', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('a', 5);
    expect(queue.dequeue()).toBe('a');
    expect(queue.dequeue()).toBeUndefined();
  });

  it('dequeue returns undefined when fully empty', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('a', 1);
    queue.dequeue();
    expect(queue.dequeue()).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it('clear() empties the queue', () => {
    const queue = new PriorityBucketQueue<string>();
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });
});