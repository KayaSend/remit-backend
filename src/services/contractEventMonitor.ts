import { ethers } from 'ethers';
import { pool } from './database.js';
import { getSimpleEscrowUSDCArtifact } from '../utils/contractUtils.js';

const BASE_RPC_URL = process.env.BASE_RPC_URL!;
const SIMPLE_ESCROW_ADDRESS = process.env.SIMPLE_ESCROW_ADDRESS!;

// Load ABI using the robust contract utility
const { abi: SimpleEscrowUSDCAbi } = getSimpleEscrowUSDCArtifact();

interface ContractEvent {
  eventName: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  args: any[];
  data?: string;
  topics?: readonly string[];
}

export class ContractEventMonitor {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private isMonitoring: boolean = false;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    this.contract = new ethers.Contract(
      SIMPLE_ESCROW_ADDRESS,
      SimpleEscrowUSDCAbi,
      this.provider
    );
  }

  async startEventMonitoring(startBlock?: number) {
    if (this.isMonitoring) {
      console.log('🔍 Event monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🚀 Starting contract event monitoring');

    try {
      // Get the latest processed block from database
      const latestBlock = startBlock || await this.getLatestProcessedBlock();
      console.log('📊 Starting from block:', latestBlock);

      // Try to setup event listeners, but handle gracefully if unsupported
      try {
        this.contract.on('EscrowCreated', (...args: any[]) => {
          this.handleEvent('EscrowCreated', args);
        });

        this.contract.on('PaymentConfirmed', (...args: any[]) => {
          this.handleEvent('PaymentConfirmed', args);
        });

        this.contract.on('EscrowRefunded', (...args: any[]) => {
          this.handleEvent('EscrowRefunded', args);
        });

        console.log('✅ Real-time event listeners setup successfully');
      } catch (error) {
        console.log('⚠️ Real-time event listeners not supported by RPC provider, using polling instead');
        
        // Start periodic polling as fallback
        this.startPollingMode();
      }

      // Process historical events
      await this.processHistoricalEvents(latestBlock);

      console.log('✅ Event monitoring started');
    } catch (error) {
      console.error('❌ Error starting event monitoring:', error);
      // Continue without event monitoring rather than crashing
      this.isMonitoring = false;
    }
  }

  private startPollingMode() {
    // Poll for new events every 30 seconds
    setInterval(async () => {
      if (!this.isMonitoring) return;
      
      try {
        const latestBlock = await this.getLatestProcessedBlock();
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > latestBlock) {
          console.log(`🔄 Polling for events from block ${latestBlock + 1} to ${currentBlock}`);
          await this.processHistoricalEvents(latestBlock + 1);
        }
      } catch (error) {
        console.error('❌ Error in polling mode:', error);
      }
    }, 30000); // Poll every 30 seconds
  }

  async stopEventMonitoring() {
    this.isMonitoring = false;
    this.contract.removeAllListeners();
    console.log('🛑 Event monitoring stopped');
  }

  private async handleEvent(eventName: string, args: any[]) {
    console.log(`📝 Event received: ${eventName}`, args);

    try {
      const event = args[args.length - 1]; // Event object is last argument
      const eventData = {
        eventName,
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        args: args.slice(0, -1), // Remove event object
      };

      await this.saveEventToDatabase(eventData);
      await this.updateRelatedRecords(eventData);
      
      console.log(`✅ Processed event: ${eventName}`, event.transactionHash);
    } catch (error) {
      console.error(`❌ Error processing event ${eventName}:`, error);
    }
  }

  private async saveEventToDatabase(event: ContractEvent) {
    const eventData = {
      event_name: event.eventName,
      contract_address: SIMPLE_ESCROW_ADDRESS,
      tx_hash: event.txHash,
      block_number: event.blockNumber,
      log_index: event.logIndex,
      event_data: JSON.stringify(this.formatEventData(event)),
      escrow_id_hash: this.extractEscrowIdHash(event),
      payment_id: this.extractPaymentId(event),
      sender_address: this.extractSenderAddress(event),
      beneficiary_address: this.extractBeneficiaryAddress(event),
      amount_usdc: this.extractAmount(event),
      block_timestamp: new Date(), // Will be updated with actual block time
    };

    await pool.query(
      `
      INSERT INTO contract_events (
        event_name, contract_address, tx_hash, block_number, log_index,
        event_data, escrow_id_hash, payment_id, sender_address,
        beneficiary_address, amount_usdc, block_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tx_hash, log_index) DO NOTHING
      `,
      Object.values(eventData)
    );
  }

  private async updateRelatedRecords(event: ContractEvent) {
    switch (event.eventName) {
      case 'EscrowCreated':
        await this.handleEscrowCreated(event);
        break;
      case 'PaymentConfirmed':
        await this.handlePaymentConfirmed(event);
        break;
      case 'EscrowRefunded':
        await this.handleEscrowRefunded(event);
        break;
    }
  }

  private async handleEscrowCreated(event: ContractEvent) {
    const [escrowId, sender, beneficiary, amount, expiry] = event.args;
    
    // Try to find the escrow in database by blockchain_escrow_id
    const { rows } = await pool.query(
      `
      UPDATE contract_events
      SET escrow_id = (
        SELECT escrow_id 
        FROM escrows 
        WHERE blockchain_escrow_id = $1
        LIMIT 1
      )
      WHERE tx_hash = $2 AND log_index = $3
      RETURNING escrow_id
      `,
      [
        Number(escrowId), // Use the blockchain escrow ID directly
        event.txHash,
        event.logIndex,
      ]
    );

    if (rows.length > 0) {
      console.log('🔗 Linked event to escrow:', rows[0].escrow_id);
    }
  }

  private async handlePaymentConfirmed(event: ContractEvent) {
    const [escrowId, paymentId, beneficiary, amount] = event.args;
    
    // Update transaction status to confirmed
    await pool.query(
      `
      UPDATE blockchain_transactions
      SET status = 'confirmed', confirmations = 1, confirmed_at = NOW()
      WHERE tx_hash = $1
      `,
      [event.txHash]
    );
  }

  private async handleEscrowRefunded(event: ContractEvent) {
    const [escrowId, sender] = event.args;
    
    // Update transaction status to confirmed
    await pool.query(
      `
      UPDATE blockchain_transactions
      SET status = 'confirmed', confirmations = 1, confirmed_at = NOW()
      WHERE tx_hash = $1
      `,
      [event.txHash]
    );
  }

  private async processHistoricalEvents(startBlock: number) {
    console.log('📚 Processing historical events from block', startBlock);

    try {
      const latestBlock = await this.provider.getBlockNumber();
      const batchSize = 1000; // Process in batches to avoid timeouts

      for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += batchSize) {
        const toBlock = Math.min(fromBlock + batchSize - 1, latestBlock);
        
        try {
          // Try to query events using filters (may not work with some RPC providers)
          const events = await this.tryQueryFilterWithFallback('EscrowCreated', fromBlock, toBlock);
          const paymentEvents = await this.tryQueryFilterWithFallback('PaymentConfirmed', fromBlock, toBlock);
          const refundEvents = await this.tryQueryFilterWithFallback('EscrowRefunded', fromBlock, toBlock);

          const allEvents = [
            ...events.map(e => ({ eventName: 'EscrowCreated', ...e })),
            ...paymentEvents.map(e => ({ eventName: 'PaymentConfirmed', ...e })),
            ...refundEvents.map(e => ({ eventName: 'EscrowRefunded', ...e })),
          ];

          console.log(`📊 Processing ${allEvents.length} events from blocks ${fromBlock}-${toBlock}`);

          for (const event of allEvents) {
            await this.handleEvent(event.eventName, [...(event as any).args || [], event]);
          }

          // Update the latest processed block in the database
          await this.updateLatestProcessedBlock(toBlock);

        } catch (error) {
          console.error(`❌ Error processing blocks ${fromBlock}-${toBlock}:`, error);
          // Continue with next batch rather than failing completely
        }
      }

      console.log('✅ Historical event processing complete');
    } catch (error) {
      console.error('❌ Error in historical event processing:', error);
      console.log('📝 Event monitoring will continue without historical processing');
    }
  }

  private async tryQueryFilterWithFallback(eventName: string, fromBlock: number, toBlock: number): Promise<any[]> {
    try {
      let filter;
      switch (eventName) {
        case 'EscrowCreated':
          filter = this.contract.filters.EscrowCreated();
          break;
        case 'PaymentConfirmed':
          filter = this.contract.filters.PaymentConfirmed();
          break;
        case 'EscrowRefunded':
          filter = this.contract.filters.EscrowRefunded();
          break;
        default:
          return [];
      }

      return await this.contract.queryFilter(filter, fromBlock, toBlock);
    } catch (error: any) {
      if (error.code === 'BAD_DATA' || error.message?.includes('eth_newFilter')) {
        console.log(`⚠️ Event filtering not supported for ${eventName}, skipping historical events`);
        return [];
      }
      throw error; // Re-throw other errors
    }
  }

  private async updateLatestProcessedBlock(blockNumber: number) {
    try {
      await pool.query(
        `INSERT INTO contract_monitoring_state (key, value) 
         VALUES ('latest_processed_block', $1) 
         ON CONFLICT (key) DO UPDATE SET 
         value = $1, updated_at = NOW()`,
        [blockNumber.toString()]
      );
    } catch (error) {
      // If table doesn't exist, create it
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contract_monitoring_state (
          key VARCHAR(50) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await pool.query(
        `INSERT INTO contract_monitoring_state (key, value) 
         VALUES ('latest_processed_block', $1) 
         ON CONFLICT (key) DO UPDATE SET 
         value = $1, updated_at = NOW()`,
        [blockNumber.toString()]
      );
    }
  }

  private async getLatestProcessedBlock(): Promise<number> {
    try {
      // Try to get from the new monitoring state table first
      const { rows } = await pool.query(
        `SELECT value FROM contract_monitoring_state WHERE key = 'latest_processed_block'`
      );
      
      if (rows[0]?.value) {
        return parseInt(rows[0].value);
      }

      // Fallback to contract_events table
      const { rows: eventRows } = await pool.query(
        'SELECT MAX(block_number) as latest_block FROM contract_events'
      );
      
      return eventRows[0]?.latest_block ? Number(eventRows[0].latest_block) : 0;
    } catch (error) {
      console.error('Error getting latest processed block:', error);
      return 0;
    }
  }

  private formatEventData(event: ContractEvent): any {
    switch (event.eventName) {
      case 'EscrowCreated':
        return {
          escrowId: Number(event.args[0]),
          sender: event.args[1],
          beneficiary: event.args[2],
          amount: ethers.formatUnits(event.args[3], 6), // USDC has 6 decimals
          expiry: Number(event.args[4]),
        };
      case 'PaymentConfirmed':
        return {
          escrowId: Number(event.args[0]),
          paymentId: event.args[1],
          beneficiary: event.args[2],
          amount: ethers.formatUnits(event.args[3], 6), // USDC has 6 decimals
        };
      case 'EscrowRefunded':
        return {
          escrowId: Number(event.args[0]),
          sender: event.args[1],
        };
      default:
        return { args: event.args };
    }
  }

  private extractEscrowIdHash(event: ContractEvent): string | null {
    if (['EscrowCreated', 'PaymentConfirmed', 'EscrowRefunded'].includes(event.eventName)) {
      return Number(event.args[0]).toString();
    }
    return null;
  }

  private extractPaymentId(event: ContractEvent): string | null {
    if (event.eventName === 'PaymentConfirmed') {
      return event.args[1]; // paymentId is a string in USDC contract
    }
    return null;
  }

  private extractSenderAddress(event: ContractEvent): string | null {
    if (['EscrowCreated', 'EscrowRefunded'].includes(event.eventName)) {
      return event.args[1];
    }
    return null;
  }

  private extractBeneficiaryAddress(event: ContractEvent): string | null {
    if (event.eventName === 'EscrowCreated') {
      return event.args[2];
    }
    if (event.eventName === 'PaymentConfirmed') {
      return event.args[2]; // beneficiary in PaymentConfirmed event
    }
    return null;
  }

  private extractAmount(event: ContractEvent): string | null {
    if (event.eventName === 'EscrowCreated' || event.eventName === 'PaymentConfirmed') {
      return event.args[3]?.toString() || null; // amount is in position 3 for both events
    }
    return null;
  }

  // Health check method
  async getMonitoringStatus(): Promise<{
    isMonitoring: boolean;
    latestProcessedBlock: number;
    latestBlockNumber: number;
    eventsProcessed: number;
  }> {
    const latestProcessedBlock = await this.getLatestProcessedBlock();
    const latestBlockNumber = await this.provider.getBlockNumber();
    
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM contract_events'
    );

    return {
      isMonitoring: this.isMonitoring,
      latestProcessedBlock,
      latestBlockNumber,
      eventsProcessed: parseInt(rows[0].count),
    };
  }
}

// Singleton instance
export const contractEventMonitor = new ContractEventMonitor();

// Note: Auto-start disabled because many RPC providers don't support eth_newFilter
// Event monitoring can be started manually via API if needed

export default contractEventMonitor;
