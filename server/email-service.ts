import { Resend } from 'resend';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Easy Fuel ZA <noreply@easyfuel.ai>';
  
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

interface DriverAcceptanceEmailParams {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  driverName: string;
  driverPhone: string;
  confirmedDeliveryTime: string;
  fuelType: string;
  litres: string;
  deliveryAddress: string;
}

/**
 * Sends email notification to customer when driver accepts their order
 */
export async function sendDriverAcceptanceEmail(
  params: DriverAcceptanceEmailParams
): Promise<void> {
  try {
    const { client, fromEmail } = getResendClient();

    const { data, error } = await client.emails.send({
      from: fromEmail || 'Easy Fuel ZA <noreply@easyfuel.ai>',
      to: [params.customerEmail],
      subject: `Driver Assigned - Order #${params.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #1fbfb8 0%, #0e6763 100%);
                color: white;
                padding: 30px 20px;
                border-radius: 8px 8px 0 0;
                text-align: center;
              }
              .content {
                background: #ffffff;
                padding: 30px;
                border: 1px solid #e0e0e0;
                border-top: none;
              }
              .info-row {
                margin: 15px 0;
                padding: 10px;
                background: #f9f9f9;
                border-radius: 4px;
              }
              .label {
                font-weight: 600;
                color: #0e6763;
                display: inline-block;
                min-width: 140px;
              }
              .footer {
                background: #f5f5f5;
                padding: 20px;
                border-radius: 0 0 8px 8px;
                text-align: center;
                font-size: 14px;
                color: #666;
              }
              .button {
                display: inline-block;
                background: #1fbfb8;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 4px;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">🚚 Driver Assigned!</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">Your fuel delivery is on the way</p>
            </div>
            
            <div class="content">
              <p>Hi ${params.customerName},</p>
              
              <p>Great news! A driver has accepted your fuel delivery order and will deliver your fuel at the confirmed time.</p>
              
              <h2 style="color: #0e6763; margin-top: 30px;">Order Details</h2>
              
              <div class="info-row">
                <span class="label">Order Number:</span>
                <span>#${params.orderNumber}</span>
              </div>
              
              <div class="info-row">
                <span class="label">Fuel Type:</span>
                <span>${params.fuelType}</span>
              </div>
              
              <div class="info-row">
                <span class="label">Quantity:</span>
                <span>${params.litres} litres</span>
              </div>
              
              <div class="info-row">
                <span class="label">Delivery Address:</span>
                <span>${params.deliveryAddress}</span>
              </div>
              
              <div class="info-row">
                <span class="label">Confirmed Time:</span>
                <span>${params.confirmedDeliveryTime}</span>
              </div>
              
              <h2 style="color: #0e6763; margin-top: 30px;">Your Driver</h2>
              
              <div class="info-row">
                <span class="label">Driver Name:</span>
                <span>${params.driverName}</span>
              </div>
              
              <div class="info-row">
                <span class="label">Driver Phone:</span>
                <span><a href="tel:${params.driverPhone}">${params.driverPhone}</a></span>
              </div>
              
              <p style="margin-top: 30px;">Your driver will arrive at the confirmed time. Please ensure someone is available to receive the delivery.</p>
              
              <p>If you have any questions or need to make changes, please contact our support team.</p>
            </div>
            
            <div class="footer">
              <p style="margin: 0;"><strong>Easy Fuel ZA</strong></p>
              <p style="margin: 5px 0 0 0;">South Africa's Premier Fuel Delivery Service</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending email via Resend:', error);
      throw error;
    }

    console.log('Driver acceptance email sent successfully:', data);
  } catch (error) {
    console.error('Error in sendDriverAcceptanceEmail:', error);
    throw error;
  }
}

type DeliveryCompletionAudience = "customer" | "driver";

interface DeliveryCompletionEmailParams {
  toEmail: string;
  recipientName: string;
  audience: DeliveryCompletionAudience;
  orderNumber: string;
  fuelType: string;
  litres: string;
  deliveryAddress: string;
  deliveredAt: string;
  driverName: string;
  customerName: string;
  signatureName?: string | null;
}

/**
 * Sends delivery completion email to either customer or driver.
 */
export async function sendDeliveryCompletionEmail(
  params: DeliveryCompletionEmailParams
): Promise<void> {
  try {
    const { client, fromEmail } = getResendClient();

    const headline =
      params.audience === "customer"
        ? "✅ Delivery Complete!"
        : "✅ Delivery Completed";

    const intro =
      params.audience === "customer"
        ? `We're happy to let you know that your fuel delivery (Order #${params.orderNumber}) has been completed successfully.`
        : `You have successfully completed delivery for Order #${params.orderNumber}.`;

    const signatureBlock =
      params.signatureName
        ? `<div class="info-row">
              <span class="label">Signed By:</span>
              <span>${params.signatureName}</span>
            </div>`
        : "";

    const acknowledgement =
      params.audience === "customer"
        ? "<p>Thank you for choosing Easy Fuel ZA. If there’s anything else you need, our support team is ready to help.</p>"
        : "<p>Thanks for delivering with Easy Fuel ZA. The job has been added to your completed deliveries.</p>";

    const closing =
      params.audience === "customer"
        ? "<p>Regards,<br/>The Easy Fuel ZA Team</p>"
        : "<p>Keep up the great work!<br/>The Easy Fuel ZA Team</p>";

    const { error } = await client.emails.send({
      from: fromEmail || "Easy Fuel ZA <noreply@easyfuel.ai>",
      to: [params.toEmail],
      subject: `Order #${params.orderNumber} Delivered`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #1fbfb8 0%, #0e6763 100%);
                color: white;
                padding: 30px 20px;
                border-radius: 8px 8px 0 0;
                text-align: center;
              }
              .content {
                background: #ffffff;
                padding: 30px;
                border: 1px solid #e0e0e0;
                border-top: none;
              }
              .info-row {
                margin: 15px 0;
                padding: 10px;
                background: #f9f9f9;
                border-radius: 4px;
              }
              .label {
                font-weight: 600;
                color: #0e6763;
                display: inline-block;
                min-width: 140px;
              }
              .footer {
                background: #f5f5f5;
                padding: 20px;
                border-radius: 0 0 8px 8px;
                text-align: center;
                font-size: 14px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">${headline}</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">Order #${params.orderNumber}</p>
            </div>
            
            <div class="content">
              <p>Hi ${params.recipientName || "there"},</p>

              <p>${intro}</p>

              <h2 style="color: #0e6763; margin-top: 30px;">Delivery Summary</h2>

              <div class="info-row">
                <span class="label">Customer:</span>
                <span>${params.customerName}</span>
              </div>

              <div class="info-row">
                <span class="label">Driver:</span>
                <span>${params.driverName}</span>
              </div>

              <div class="info-row">
                <span class="label">Delivered At:</span>
                <span>${params.deliveredAt}</span>
              </div>

              <div class="info-row">
                <span class="label">Fuel Type:</span>
                <span>${params.fuelType}</span>
              </div>

              <div class="info-row">
                <span class="label">Quantity:</span>
                <span>${params.litres} litres</span>
              </div>

              <div class="info-row">
                <span class="label">Delivery Address:</span>
                <span>${params.deliveryAddress}</span>
              </div>

              ${signatureBlock}

              ${acknowledgement}

              ${closing}
            </div>

            <div class="footer">
              <p style="margin: 0;"><strong>Easy Fuel ZA</strong></p>
              <p style="margin: 5px 0 0 0;">South Africa's Premier Fuel Delivery Service</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("Error sending delivery completion email via Resend:", error);
      throw error;
    }

    console.log(
      `Delivery completion email sent to ${params.toEmail} for order ${params.orderNumber} (${params.audience})`
    );
  } catch (error) {
    console.error("Error in sendDeliveryCompletionEmail:", error);
    throw error;
  }
}
