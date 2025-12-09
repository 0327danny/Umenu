/**
 * mealme-service.js
 * 
 * Wrapper for MealMe API for restaurant and menu searching
 * Docs: https://docs.mealme.ai/reference
 * 
 * Provides:
 * - searchRestaurants(latitude, longitude, radius, query)
 * - getMenuItems(restaurantId, quoteId)
 * - searchMenuItems(items, filters)
 */

const axios = require('axios');

const MEALME_BASE_URL = 'https://api.mealme.ai/v3';

class MealMeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: MEALME_BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Search for restaurants near a location
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusMiles
   * @param {string} query - Optional search query (restaurant name, type)
   * @returns {Promise<Array>} Array of restaurants with quoteIds
   */
  async searchRestaurants(latitude, longitude, radiusMiles = 3, query = '') {
    try {
      console.log(`[MealMe] Searching restaurants near ${latitude}, ${longitude}`);
      
      const params = {
        latitude,
        longitude,
        radius_miles: radiusMiles,
        // MealMe uses 'status' to filter (open, closed, all)
        status: 'all',
        // 'sort_by' can be 'relevance', 'rating', 'delivery_time', 'delivery_fee'
        sort_by: 'rating',
        // Limit results to speed up processing
        limit: 20,
      };

      // Add query if provided
      if (query && query.trim()) {
        params.query = query;
      }

      const response = await this.client.get('/search/store', { params });

      if (!response.data || !response.data.data) {
        console.warn('[MealMe] No restaurants found');
        return [];
      }

      // Normalize response
      return response.data.data.map(store => ({
        id: store.id,
        name: store.name,
        latitude: store.coordinates?.latitude,
        longitude: store.coordinates?.longitude,
        address: store.address,
        phone: store.phone,
        rating: store.rating,
        reviewCount: store.review_count || 0,
        categories: store.categories || [],
        imageUrl: store.image_url,
        webUrl: store.web_url,
        quoteIds: store.quote_ids || [], // Used for getting menus
        source: 'mealme',
        dietaryOptions: (store.categories || []).map(c => c.name),
      }));
    } catch (error) {
      console.error('[MealMe] Search error:', error.message);
      return [];
    }
  }

  /**
   * Get menu items for a specific restaurant and delivery service
   * @param {string} quoteId - Quote ID from searchRestaurants
   * @returns {Promise<Array>} Array of menu items
   */
  async getMenuItems(quoteId) {
    try {
      console.log(`[MealMe] Fetching menu for quote ${quoteId}`);

      const response = await this.client.get(`/menu/product_list/${quoteId}`);

      if (!response.data || !response.data.data) {
        console.warn(`[MealMe] No menu items for quote ${quoteId}`);
        return [];
      }

      // Flatten categories and items
      const items = [];
      const categories = response.data.data;

      categories.forEach(category => {
        if (category.products && Array.isArray(category.products)) {
          category.products.forEach(product => {
            items.push({
              id: product.id,
              name: product.name,
              description: product.description || '',
              category: category.name,
              price: product.price || 0,
              image: product.image,
              available: product.available !== false,
              allergens: product.allergens || [],
              dietary_labels: product.dietary_labels || [],
              ingredients: product.ingredients || [],
              calories: product.calories,
              nutrition: product.nutrition,
              customizations: product.customizations || [],
            });
          });
        }
      });

      return items;
    } catch (error) {
      console.error('[MealMe] Menu fetch error:', error.message);
      return [];
    }
  }

  /**
   * Get details for a specific product
   * @param {string} quoteId
   * @param {string} productId
   * @returns {Promise<Object>} Product details
   */
  async getProductDetails(quoteId, productId) {
    try {
      const response = await this.client.get(`/menu/product/${quoteId}/${productId}`);
      return response.data.data || null;
    } catch (error) {
      console.error('[MealMe] Product details error:', error.message);
      return null;
    }
  }

  /**
   * Filter menu items by allergens and dietary preferences
   * @param {Array} items - Menu items from getMenuItems
   * @param {Array} allergens - User allergies to exclude
   * @param {Array} dietaryRestrictions - Required dietary labels
   * @returns {Array} Filtered items
   */
  filterItemsByPreferences(items, allergens = [], dietaryRestrictions = []) {
    return items.filter(item => {
      // Check allergens - exclude if item contains any user allergen
      if (allergens && allergens.length > 0) {
        const itemAllergens = (item.allergens || []).map(a => a.toLowerCase());
        const hasAllergen = allergens.some(a =>
          itemAllergens.includes(a.toLowerCase())
        );
        if (hasAllergen) return false;
      }

      // Check dietary restrictions - include only if item meets all restrictions
      if (dietaryRestrictions && dietaryRestrictions.length > 0) {
        const itemLabels = (item.dietary_labels || []).map(l => l.toLowerCase());
        const meetsAllRestrictions = dietaryRestrictions.every(restriction => {
          const restrictionLower = restriction.toLowerCase();
          // Check if item has the dietary label OR is implied by other labels
          if (itemLabels.includes(restrictionLower)) return true;
          
          // Implication rules (e.g., vegan implies vegetarian)
          if (restrictionLower === 'vegetarian' && itemLabels.includes('vegan')) return true;
          if (restrictionLower === 'pescetarian' && 
              (itemLabels.includes('vegan') || itemLabels.includes('vegetarian'))) {
            return true;
          }
          
          return false;
        });
        
        if (!meetsAllRestrictions) return false;
      }

      // Item is available
      if (item.available === false) return false;

      return true;
    });
  }
}

module.exports = MealMeService;
