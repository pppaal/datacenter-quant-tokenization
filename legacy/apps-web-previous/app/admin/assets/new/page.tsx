import { AdminNav } from '@/components/admin/admin-nav';
import { AssetForm } from '@/components/admin/asset-form';

export default function NewAssetPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">New Asset</h1>
      <AdminNav />
      <AssetForm mode="create" />
    </main>
  );
}
