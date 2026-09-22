import { TransactionList } from './transaction-list';

export function WalletTransactions({ walletId, walletAddress, network }: {
  walletId: string; walletAddress: string; network: 'EVM' | 'SOLANA';
}) {
  return <TransactionList walletId={walletId} walletAddress={walletAddress} network={network} />;
}
