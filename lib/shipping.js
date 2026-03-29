/**
 * Shipping integration via EasyPost
 * Label generation, rate quotes, address verification
 */

const EasyPostApi = require('@easypost/api');

function getEasyPost() {
    const key = process.env.EASYPOST_API_KEY;
    if (!key) return null;
    return new EasyPostApi(key);
}

/**
 * Verify a shipping address
 */
async function verifyAddress(address) {
    const client = getEasyPost();
    if (!client) throw new Error('EasyPost not configured');

    const addr = await client.Address.create({
        street1: address.street1,
        street2: address.street2 || '',
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: 'US',
        verify: ['delivery'],
    });

    return {
        verified: !!(addr.verifications?.delivery?.success),
        address: {
            street1: addr.street1,
            street2: addr.street2,
            city: addr.city,
            state: addr.state,
            zip: addr.zip,
        },
        errors: addr.verifications?.delivery?.errors || [],
    };
}

/**
 * Create a shipment and get rate quotes
 */
async function createShipment(fromAddress, toAddress, parcel) {
    const client = getEasyPost();
    if (!client) throw new Error('EasyPost not configured');

    const shipment = await client.Shipment.create({
        from_address: {
            name: fromAddress.name,
            street1: fromAddress.street1,
            city: fromAddress.city,
            state: fromAddress.state,
            zip: fromAddress.zip,
            country: 'US',
        },
        to_address: {
            name: toAddress.name,
            street1: toAddress.street1,
            street2: toAddress.street2 || '',
            city: toAddress.city,
            state: toAddress.state,
            zip: toAddress.zip,
            country: 'US',
        },
        parcel: {
            length: parcel.length || 6,
            width: parcel.width || 4,
            height: parcel.height || 1,
            weight: parcel.weight_oz || 3,
        },
    });

    return {
        shipment_id: shipment.id,
        rates: shipment.rates.map(r => ({
            id: r.id,
            carrier: r.carrier,
            service: r.service,
            rate: parseFloat(r.rate),
            delivery_days: r.delivery_days,
            est_delivery: r.est_delivery_date,
        })).sort((a, b) => a.rate - b.rate),
    };
}

/**
 * Buy a label at the selected rate
 */
async function buyLabel(shipmentId, rateId) {
    const client = getEasyPost();
    if (!client) throw new Error('EasyPost not configured');

    const shipment = await client.Shipment.retrieve(shipmentId);
    const bought = await client.Shipment.buy(shipment.id, rateId);

    return {
        tracking_number: bought.tracking_code,
        label_url: bought.postage_label?.label_url,
        carrier: bought.selected_rate?.carrier,
        service: bought.selected_rate?.service,
        rate: parseFloat(bought.selected_rate?.rate || 0),
        tracker_id: bought.tracker?.id,
    };
}

module.exports = { getEasyPost, verifyAddress, createShipment, buyLabel };
