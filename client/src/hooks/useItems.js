import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchItems, deleteItem as apiDeleteItem } from '../services/api.js';

export function useItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef(null);

  const loadItems = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const data = await fetchItems();
      setItems(data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch items');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadItems(true);
  }, [loadItems]);

  // Polling logic: actively poll while any item is in 'pending' or 'processing'
  useEffect(() => {
    const hasActiveJobs = items.some(
      (item) => item.processing_status === 'pending' || item.processing_status === 'processing'
    );

    setIsPolling(hasActiveJobs);

    if (hasActiveJobs) {
      pollTimerRef.current = setTimeout(() => {
        loadItems(false);
      }, 2000);
    } else {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [items, loadItems]);

  const removeItem = async (id) => {
    try {
      await apiDeleteItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete item');
      throw err;
    }
  };

  const addItem = (newItem) => {
    setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
  };

  return {
    items,
    loading,
    error,
    isPolling,
    refresh: () => loadItems(false),
    removeItem,
    addItem,
  };
}
