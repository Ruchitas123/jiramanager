import EmailActivityLogger from './emailActivityLogger.js';

/**
 * Standalone script to view email activity status
 * Note: Detailed activity logging is disabled for security to protect sensitive email data
 * 
 * Usage:
 * npm run view-activity
 * or
 * node build/viewEmailActivity.js
 */

console.log('📊 Email Activity Viewer');
console.log('========================');
console.log('Note: Detailed logging disabled for security - sensitive data not stored.\n');

async function main() {
    try {
        const activityLogger = new EmailActivityLogger();
        
        // Display the security-focused summary
        activityLogger.displayActivitySummary();
        
        console.log('\n💡 TIP: Email operations are logged to console only during execution.');
        console.log('🔒 Email addresses and sensitive data are not stored for security.');
        
    } catch (error) {
        console.error('❌ Failed to display activity summary:', error);
        process.exit(1);
    }
}

// Run the viewer
main().catch(console.error); 